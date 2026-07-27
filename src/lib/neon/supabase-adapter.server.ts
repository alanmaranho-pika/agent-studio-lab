import { getNeonSql, hasNeonDatabase } from "./client.server";

type ColumnType =
  | "bigint"
  | "boolean"
  | "double"
  | "integer"
  | "jsonb"
  | "text"
  | "text[]"
  | "timestamptz"
  | "uuid";

type TableDefinition = {
  columns: Record<string, ColumnType>;
  primaryKey: string[];
  ownership: "global" | "profile" | "project" | "project-child" | "user";
};

const TABLES = {
  profiles: {
    columns: {
      id: "uuid",
      display_name: "text",
      avatar_url: "text",
      created_at: "timestamptz",
      updated_at: "timestamptz",
    },
    primaryKey: ["id"],
    ownership: "profile",
  },
  projects: {
    columns: {
      id: "uuid",
      user_id: "uuid",
      title: "text",
      status: "text",
      skill: "text",
      studio_mode: "text",
      studio_model: "text",
      project_state: "jsonb",
      created_at: "timestamptz",
      updated_at: "timestamptz",
    },
    primaryKey: ["id"],
    ownership: "project",
  },
  project_assets: {
    columns: {
      id: "uuid",
      project_id: "uuid",
      user_id: "uuid",
      kind: "text",
      mime: "text",
      name: "text",
      storage_path: "text",
      url: "text",
      label: "text",
      attached_to: "text",
      width: "integer",
      height: "integer",
      duration: "double",
      created_at: "timestamptz",
    },
    primaryKey: ["id"],
    ownership: "project-child",
  },
  project_messages: {
    columns: {
      id: "uuid",
      project_id: "uuid",
      user_id: "uuid",
      role: "text",
      parts: "jsonb",
      tokens: "integer",
      created_at: "timestamptz",
    },
    primaryKey: ["id"],
    ownership: "project-child",
  },
  project_jobs: {
    columns: {
      id: "uuid",
      project_id: "uuid",
      user_id: "uuid",
      model: "text",
      app_label: "text",
      app_id: "text",
      mode: "text",
      prompt: "text",
      input: "jsonb",
      status: "text",
      error: "text",
      external_id: "text",
      status_url: "text",
      response_url: "text",
      result_url: "text",
      asset_id: "uuid",
      attempts: "integer",
      max_attempts: "integer",
      placeholder_asset_id: "uuid",
      created_at: "timestamptz",
      updated_at: "timestamptz",
    },
    primaryKey: ["id"],
    ownership: "project-child",
  },
  skill_playbook_overrides: {
    columns: {
      user_id: "uuid",
      app_id: "text",
      body_md: "text",
      created_at: "timestamptz",
      updated_at: "timestamptz",
    },
    primaryKey: ["user_id", "app_id"],
    ownership: "user",
  },
  agent_skills: {
    columns: {
      id: "text",
      app_id: "text",
      label: "text",
      kind: "text",
      intent: "text",
      one_liner: "text",
      outputs: "text[]",
      matches: "text[]",
      uses_blocks: "text[]",
      model: "text",
      mode: "text",
      steps: "jsonb",
      body_md: "text",
      sort_order: "integer",
      is_active: "boolean",
      version: "integer",
      created_at: "timestamptz",
      updated_at: "timestamptz",
    },
    primaryKey: ["id"],
    ownership: "global",
  },
  agent_skill_versions: {
    columns: {
      id: "bigint",
      skill_id: "text",
      version: "integer",
      body_md: "text",
      actor_type: "text",
      actor_id: "uuid",
      actor_name: "text",
      action: "text",
      restored_from_version: "integer",
      created_at: "timestamptz",
    },
    primaryKey: ["id"],
    ownership: "global",
  },
} as const satisfies Record<string, TableDefinition>;

type NeonTable = keyof typeof TABLES;
type Row = Record<string, unknown>;
type Filter =
  | {
      column: string;
      operator: "contains" | "eq" | "gt" | "gte" | "ilike" | "like" | "lt" | "lte" | "neq";
      value: unknown;
    }
  | { column: string; operator: "in"; value: unknown[] }
  | { column: string; operator: "is"; value: boolean | null }
  | { expression: string; operator: "or" };
type Mutation =
  | { kind: "delete" }
  | { kind: "insert"; rows: Row[] }
  | { kind: "update"; values: Row }
  | {
      kind: "upsert";
      ignoreDuplicates: boolean;
      onConflict?: string;
      rows: Row[];
    };
type SingleMode = "many" | "maybeSingle" | "single";

type PostgrestLikeError = {
  code: string;
  details: string | null;
  hint: string | null;
  message: string;
};

type QueryResult = {
  count: number | null;
  data: unknown;
  error: PostgrestLikeError | null;
  status: number;
  statusText: string;
};

type QueryOptions = {
  count?: "estimated" | "exact" | "planned";
  head?: boolean;
};

type MutationOptions = {
  count?: "estimated" | "exact" | "planned";
};

type UpsertOptions = MutationOptions & {
  ignoreDuplicates?: boolean;
  onConflict?: string;
};

type Order = {
  ascending: boolean;
  column: string;
  nullsFirst?: boolean;
};

const RPC_ARGUMENTS: Record<string, string[]> = {
  create_agent_skill: [
    "p_id",
    "p_app_id",
    "p_label",
    "p_kind",
    "p_intent",
    "p_one_liner",
    "p_outputs",
    "p_matches",
    "p_uses_blocks",
    "p_model",
    "p_mode",
    "p_steps",
    "p_body_md",
    "p_actor_id",
    "p_actor_name",
  ],
  restore_agent_skill_body: [
    "p_app_id",
    "p_target_version",
    "p_expected_version",
    "p_actor_id",
    "p_actor_name",
  ],
  update_agent_skill_body: [
    "p_app_id",
    "p_body_md",
    "p_expected_version",
    "p_actor_type",
    "p_actor_id",
    "p_actor_name",
  ],
};

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableDefinition(table: NeonTable): TableDefinition {
  return TABLES[table] as TableDefinition;
}

function columnType(table: NeonTable, column: string): ColumnType {
  const type = tableDefinition(table).columns[column];
  if (!type) throw new Error(`Unknown column "${column}" on "${table}"`);
  return type;
}

function castFor(type: ColumnType): string {
  switch (type) {
    case "bigint":
      return "::bigint";
    case "boolean":
      return "::boolean";
    case "double":
      return "::double precision";
    case "integer":
      return "::integer";
    case "jsonb":
      return "::jsonb";
    case "text[]":
      return "::text[]";
    case "timestamptz":
      return "::timestamptz";
    case "uuid":
      return "::uuid";
    default:
      return "::text";
  }
}

function parameterValue(type: ColumnType, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (type === "jsonb" && value !== null && typeof value !== "string") {
    return JSON.stringify(value);
  }
  return value;
}

function addParameter(parameters: unknown[], type: ColumnType, value: unknown): string {
  parameters.push(parameterValue(type, value));
  return `$${parameters.length}${castFor(type)}`;
}

function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function selectExpression(table: NeonTable, selection: string): string {
  if (selection.trim() === "*") return "*";

  return splitCommaList(selection)
    .map((part) => {
      if (part.includes("(") || part.includes(")") || part.includes("->")) {
        throw new Error(`Unsupported nested selection "${part}" on Neon table "${table}"`);
      }
      const separator = part.indexOf(":");
      const alias = separator >= 0 ? part.slice(0, separator).trim() : null;
      const column = separator >= 0 ? part.slice(separator + 1).trim() : part;
      columnType(table, column);
      return alias
        ? `${quoteIdentifier(column)} AS ${quoteIdentifier(alias)}`
        : quoteIdentifier(column);
    })
    .join(", ");
}

function normalizeRows(value: Row | Row[]): Row[] {
  return (Array.isArray(value) ? value : [value]).map((row) => ({ ...row }));
}

function postgrestError(error: unknown): PostgrestLikeError {
  const source = error as {
    code?: string;
    detail?: string;
    hint?: string;
    message?: string;
  };
  return {
    code: source?.code ?? "NEON_ERROR",
    details: source?.detail ?? null,
    hint: source?.hint ?? null,
    message: source?.message ?? String(error),
  };
}

class NeonQueryBuilder implements PromiseLike<QueryResult> {
  private countMode: QueryOptions["count"];
  private filters: Filter[] = [];
  private head = false;
  private limitCount: number | undefined;
  private mutation: Mutation | undefined;
  private offsetCount: number | undefined;
  private orders: Order[] = [];
  private selection = "*";
  private selectionRequested = false;
  private singleMode: SingleMode = "many";
  private shouldThrow = false;

  constructor(
    private readonly table: NeonTable,
    private readonly userId?: string,
  ) {}

  select(columns = "*", options: QueryOptions = {}): this {
    this.selection = columns;
    this.selectionRequested = true;
    this.countMode = options.count;
    this.head = options.head ?? false;
    return this;
  }

  insert(values: Row | Row[], options: MutationOptions = {}): this {
    this.mutation = { kind: "insert", rows: normalizeRows(values) };
    this.countMode = options.count;
    return this;
  }

  upsert(values: Row | Row[], options: UpsertOptions = {}): this {
    this.mutation = {
      kind: "upsert",
      ignoreDuplicates: options.ignoreDuplicates ?? false,
      onConflict: options.onConflict,
      rows: normalizeRows(values),
    };
    this.countMode = options.count;
    return this;
  }

  update(values: Row, options: MutationOptions = {}): this {
    this.mutation = { kind: "update", values: { ...values } };
    this.countMode = options.count;
    return this;
  }

  delete(options: MutationOptions = {}): this {
    this.mutation = { kind: "delete" };
    this.countMode = options.count;
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.addComparison(column, "eq", value);
  }

  neq(column: string, value: unknown): this {
    return this.addComparison(column, "neq", value);
  }

  gt(column: string, value: unknown): this {
    return this.addComparison(column, "gt", value);
  }

  gte(column: string, value: unknown): this {
    return this.addComparison(column, "gte", value);
  }

  lt(column: string, value: unknown): this {
    return this.addComparison(column, "lt", value);
  }

  lte(column: string, value: unknown): this {
    return this.addComparison(column, "lte", value);
  }

  like(column: string, value: unknown): this {
    return this.addComparison(column, "like", value);
  }

  ilike(column: string, value: unknown): this {
    return this.addComparison(column, "ilike", value);
  }

  is(column: string, value: boolean | null): this {
    columnType(this.table, column);
    this.filters.push({ column, operator: "is", value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    columnType(this.table, column);
    this.filters.push({ column, operator: "in", value: values });
    return this;
  }

  contains(column: string, value: unknown): this {
    columnType(this.table, column);
    this.filters.push({ column, operator: "contains", value });
    return this;
  }

  match(values: Row): this {
    for (const [column, value] of Object.entries(values)) this.eq(column, value);
    return this;
  }

  or(expression: string): this {
    this.filters.push({ expression, operator: "or" });
    return this;
  }

  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}): this {
    columnType(this.table, column);
    this.orders.push({
      ascending: options.ascending ?? true,
      column,
      nullsFirst: options.nullsFirst,
    });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetCount = from;
    this.limitCount = Math.max(0, to - from + 1);
    return this;
  }

  single(): this {
    this.singleMode = "single";
    return this;
  }

  maybeSingle(): this {
    this.singleMode = "maybeSingle";
    return this;
  }

  throwOnError(): this {
    this.shouldThrow = true;
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private addComparison(
    column: string,
    operator: Extract<Filter, { column: string }>["operator"] &
      ("eq" | "gt" | "gte" | "ilike" | "like" | "lt" | "lte" | "neq"),
    value: unknown,
  ): this {
    columnType(this.table, column);
    this.filters.push({ column, operator, value });
    return this;
  }

  private async execute(): Promise<QueryResult> {
    try {
      const result = this.mutation
        ? await this.executeMutation(this.mutation)
        : await this.executeSelect();
      return result;
    } catch (error) {
      if (this.shouldThrow) throw error;
      return {
        count: null,
        data: null,
        error: postgrestError(error),
        status: 400,
        statusText: "Bad Request",
      };
    }
  }

  private async executeSelect(): Promise<QueryResult> {
    const parameters: unknown[] = [];
    const where = this.buildWhere(parameters);
    const count = this.countMode ? await this.executeCount(where, parameters) : null;

    if (this.head) return this.success(null, count);

    const projection = selectExpression(this.table, this.selection);
    const sql = [
      `SELECT ${projection} FROM public.${quoteIdentifier(this.table)}`,
      where,
      this.orderSql(),
      this.limitSql(),
    ]
      .filter(Boolean)
      .join(" ");
    const rows = (await getNeonSql().query(sql, parameters)) as Row[];
    return this.success(this.applySingleMode(rows), count);
  }

  private async executeMutation(mutation: Mutation): Promise<QueryResult> {
    this.assertMutationAllowed();
    switch (mutation.kind) {
      case "delete":
        return this.executeDelete();
      case "insert":
        return this.executeInsert(mutation.rows);
      case "update":
        return this.executeUpdate(mutation.values);
      case "upsert":
        return this.executeInsert(
          mutation.rows,
          mutation.onConflict,
          mutation.ignoreDuplicates,
          true,
        );
    }
  }

  private async executeDelete(): Promise<QueryResult> {
    const parameters: unknown[] = [];
    const where = this.buildWhere(parameters);
    const returning = this.selectionRequested
      ? ` RETURNING ${selectExpression(this.table, this.selection)}`
      : "";
    const rows = (await getNeonSql().query(
      `DELETE FROM public.${quoteIdentifier(this.table)}${where ? ` ${where}` : ""}${returning}`,
      parameters,
    )) as Row[];
    return this.success(
      this.selectionRequested ? this.applySingleMode(rows) : null,
      this.countMode ? rows.length : null,
    );
  }

  private async executeInsert(
    inputRows: Row[],
    onConflict?: string,
    ignoreDuplicates = false,
    isUpsert = false,
  ): Promise<QueryResult> {
    if (inputRows.length === 0) return this.success([], this.countMode ? 0 : null);
    const rows = await this.applyInsertScope(inputRows);
    this.validateMutationColumns(rows);
    const definition = tableDefinition(this.table);
    const columns = Object.keys(definition.columns).filter((column) =>
      rows.some((row) => row[column] !== undefined),
    );
    const parameters: unknown[] = [];

    let sql: string;
    if (columns.length === 0) {
      if (rows.length > 1) throw new Error("Cannot insert multiple empty rows");
      sql = `INSERT INTO public.${quoteIdentifier(this.table)} DEFAULT VALUES`;
    } else {
      const values = rows
        .map(
          (row) =>
            `(${columns
              .map((column) =>
                row[column] === undefined
                  ? "DEFAULT"
                  : addParameter(parameters, columnType(this.table, column), row[column]),
              )
              .join(", ")})`,
        )
        .join(", ");
      sql = `INSERT INTO public.${quoteIdentifier(this.table)} (${columns
        .map(quoteIdentifier)
        .join(", ")}) VALUES ${values}`;
    }

    if (isUpsert) {
      const conflictColumns = splitCommaList(onConflict || definition.primaryKey.join(","));
      if (conflictColumns.length === 0) {
        throw new Error(`No conflict target configured for "${this.table}"`);
      }
      conflictColumns.forEach((column) => columnType(this.table, column));
      sql += ` ON CONFLICT (${conflictColumns.map(quoteIdentifier).join(", ")})`;
      const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
      if (ignoreDuplicates || updateColumns.length === 0) {
        sql += " DO NOTHING";
      } else {
        sql += ` DO UPDATE SET ${updateColumns
          .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
          .join(", ")}`;
      }
    }

    if (this.selectionRequested) {
      sql += ` RETURNING ${selectExpression(this.table, this.selection)}`;
    }
    const returnedRows = (await getNeonSql().query(sql, parameters)) as Row[];
    return this.success(
      this.selectionRequested ? this.applySingleMode(returnedRows) : null,
      this.countMode ? returnedRows.length : null,
    );
  }

  private async executeUpdate(values: Row): Promise<QueryResult> {
    this.validateMutationColumns([values]);
    const entries = Object.entries(values).filter(([, value]) => value !== undefined);
    if (entries.length === 0) throw new Error("Update values cannot be empty");
    const parameters: unknown[] = [];
    const assignments = entries
      .map(
        ([column, value]) =>
          `${quoteIdentifier(column)} = ${addParameter(
            parameters,
            columnType(this.table, column),
            value,
          )}`,
      )
      .join(", ");
    const where = this.buildWhere(parameters);
    const returning = this.selectionRequested
      ? ` RETURNING ${selectExpression(this.table, this.selection)}`
      : "";
    const rows = (await getNeonSql().query(
      `UPDATE public.${quoteIdentifier(this.table)} SET ${assignments}${
        where ? ` ${where}` : ""
      }${returning}`,
      parameters,
    )) as Row[];
    return this.success(
      this.selectionRequested ? this.applySingleMode(rows) : null,
      this.countMode ? rows.length : null,
    );
  }

  private buildWhere(parameters: unknown[]): string {
    const clauses = this.filters.map((filter) =>
      "expression" in filter
        ? this.buildOrFilter(filter.expression, parameters)
        : this.buildFilter(filter, parameters),
    );
    const ownership = this.ownershipClause(parameters);
    if (ownership) clauses.push(ownership);
    return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  }

  private buildFilter(
    filter: Exclude<Filter, { expression: string }>,
    parameters: unknown[],
  ): string {
    const column = quoteIdentifier(filter.column);
    const type = columnType(this.table, filter.column);
    if (filter.operator === "is") {
      if (filter.value === null) return `${column} IS NULL`;
      return `${column} IS ${filter.value ? "TRUE" : "FALSE"}`;
    }
    if (filter.operator === "in") {
      if (filter.value.length === 0) return "FALSE";
      return `${column} IN (${filter.value
        .map((value) => addParameter(parameters, type, value))
        .join(", ")})`;
    }
    if (filter.operator === "contains") {
      return `${column} @> ${addParameter(parameters, type, filter.value)}`;
    }
    if (filter.value === null && filter.operator === "eq") return `${column} IS NULL`;
    if (filter.value === null && filter.operator === "neq") return `${column} IS NOT NULL`;
    const operators = {
      eq: "=",
      gt: ">",
      gte: ">=",
      ilike: "ILIKE",
      like: "LIKE",
      lt: "<",
      lte: "<=",
      neq: "<>",
    } as const;
    return `${column} ${operators[filter.operator]} ${addParameter(
      parameters,
      type,
      filter.value,
    )}`;
  }

  private buildOrFilter(expression: string, parameters: unknown[]): string {
    const clauses = splitCommaList(expression).map((part) => {
      const [column, operator, ...valueParts] = part.split(".");
      if (!column || !operator || valueParts.length === 0) {
        throw new Error(`Unsupported OR filter "${part}"`);
      }
      const value = valueParts.join(".");
      if (!["eq", "gt", "gte", "ilike", "like", "lt", "lte", "neq"].includes(operator)) {
        throw new Error(`Unsupported OR operator "${operator}"`);
      }
      return this.buildFilter(
        {
          column,
          operator: operator as "eq" | "gt" | "gte" | "ilike" | "like" | "lt" | "lte" | "neq",
          value,
        },
        parameters,
      );
    });
    return `(${clauses.join(" OR ")})`;
  }

  private ownershipClause(parameters: unknown[]): string | null {
    if (!this.userId) return null;
    const definition = tableDefinition(this.table);
    const userParameter = () => addParameter(parameters, "uuid", this.userId);
    switch (definition.ownership) {
      case "profile":
        return `${quoteIdentifier("id")} = ${userParameter()}`;
      case "project":
        return `${quoteIdentifier("user_id")} = ${userParameter()}`;
      case "project-child":
        return `${quoteIdentifier("project_id")} IN (
          SELECT ${quoteIdentifier("id")}
          FROM public.${quoteIdentifier("projects")}
          WHERE ${quoteIdentifier("user_id")} = ${userParameter()}
        )`;
      case "user":
        return `${quoteIdentifier("user_id")} = ${userParameter()}`;
      default:
        return null;
    }
  }

  private async executeCount(where: string, parameters: unknown[]): Promise<number> {
    const rows = (await getNeonSql().query(
      `SELECT count(*)::integer AS count FROM public.${quoteIdentifier(
        this.table,
      )}${where ? ` ${where}` : ""}`,
      parameters,
    )) as Array<{ count: number }>;
    return Number(rows[0]?.count ?? 0);
  }

  private orderSql(): string {
    if (this.orders.length === 0) return "";
    return `ORDER BY ${this.orders
      .map((order) => {
        const nulls =
          order.nullsFirst === undefined ? "" : order.nullsFirst ? " NULLS FIRST" : " NULLS LAST";
        return `${quoteIdentifier(order.column)} ${order.ascending ? "ASC" : "DESC"}${nulls}`;
      })
      .join(", ")}`;
  }

  private limitSql(): string {
    const parts: string[] = [];
    if (this.limitCount !== undefined) {
      if (!Number.isInteger(this.limitCount) || this.limitCount < 0) {
        throw new Error("Limit must be a non-negative integer");
      }
      parts.push(`LIMIT ${this.limitCount}`);
    }
    if (this.offsetCount !== undefined) {
      if (!Number.isInteger(this.offsetCount) || this.offsetCount < 0) {
        throw new Error("Offset must be a non-negative integer");
      }
      parts.push(`OFFSET ${this.offsetCount}`);
    }
    return parts.join(" ");
  }

  private assertMutationAllowed(): void {
    if (this.userId && tableDefinition(this.table).ownership === "global") {
      throw new Error(`Authenticated clients cannot mutate global table "${this.table}"`);
    }
  }

  private validateMutationColumns(rows: Row[]): void {
    for (const row of rows) {
      for (const column of Object.keys(row)) columnType(this.table, column);
    }
  }

  private async applyInsertScope(inputRows: Row[]): Promise<Row[]> {
    if (!this.userId) return inputRows.map((row) => ({ ...row }));
    const definition = tableDefinition(this.table);
    if (definition.ownership === "global") {
      throw new Error(`Authenticated clients cannot insert into "${this.table}"`);
    }

    const rows = inputRows.map((row) => ({ ...row }));
    for (const row of rows) {
      if (definition.ownership === "profile") {
        if (row.id !== undefined && row.id !== this.userId) {
          throw new Error("Profile ownership mismatch");
        }
        row.id = this.userId;
      } else if (definition.ownership === "project") {
        if (row.user_id !== undefined && row.user_id !== this.userId) {
          throw new Error("Project ownership mismatch");
        }
        row.user_id = this.userId;
      } else if (definition.ownership === "user") {
        if (row.user_id !== undefined && row.user_id !== this.userId) {
          throw new Error("Row ownership mismatch");
        }
        row.user_id = this.userId;
      } else if (definition.ownership === "project-child") {
        if (row.user_id !== undefined && row.user_id !== this.userId) {
          throw new Error("Project child ownership mismatch");
        }
        row.user_id = this.userId;
        const projectId = row.project_id;
        if (typeof projectId !== "string") {
          throw new Error("Project child rows require project_id");
        }
        const owned = (await getNeonSql().query(
          `SELECT 1 FROM public.${quoteIdentifier("projects")}
           WHERE ${quoteIdentifier("id")} = $1::uuid
             AND ${quoteIdentifier("user_id")} = $2::uuid
           LIMIT 1`,
          [projectId, this.userId],
        )) as Row[];
        if (owned.length === 0) throw new Error("Project not found");
      }
    }
    return rows;
  }

  private applySingleMode(rows: Row[]): Row | Row[] | null {
    if (this.singleMode === "many") return rows;
    if (rows.length === 1) return rows[0];
    if (rows.length === 0 && this.singleMode === "maybeSingle") return null;
    throw Object.assign(
      new Error(
        rows.length === 0
          ? "JSON object requested, multiple (or no) rows returned"
          : "JSON object requested, multiple rows returned",
      ),
      { code: "PGRST116" },
    );
  }

  private success(data: unknown, count: number | null): QueryResult {
    return {
      count,
      data,
      error: null,
      status: 200,
      statusText: "OK",
    };
  }
}

async function executeRpc(
  functionName: string,
  args: Record<string, unknown>,
): Promise<QueryResult> {
  try {
    const argumentNames = RPC_ARGUMENTS[functionName];
    if (!argumentNames) throw new Error(`Unsupported Neon RPC "${functionName}"`);
    const parameters = argumentNames.map((name) => args[name] ?? null);
    const assignments = argumentNames
      .map((name, index) => `${quoteIdentifier(name)} => $${index + 1}`)
      .join(", ");
    const rows = await getNeonSql().query(
      `SELECT * FROM public.${quoteIdentifier(functionName)}(${assignments})`,
      parameters,
    );
    return {
      count: null,
      data: rows,
      error: null,
      status: 200,
      statusText: "OK",
    };
  } catch (error) {
    return {
      count: null,
      data: null,
      error: postgrestError(error),
      status: 400,
      statusText: "Bad Request",
    };
  }
}

export function createNeonDataClient<T extends object>(
  fallbackClient: T,
  options: { userId?: string } = {},
): T {
  if (!hasNeonDatabase()) return fallbackClient;

  return new Proxy(fallbackClient, {
    get(target, property) {
      if (property === "from") {
        return (table: string) => {
          if (table in TABLES) {
            return new NeonQueryBuilder(table as NeonTable, options.userId);
          }
          const fallbackFrom = Reflect.get(target, "from", target) as (name: string) => unknown;
          return fallbackFrom.call(target, table);
        };
      }
      if (property === "rpc") {
        return (functionName: string, args: Record<string, unknown> = {}) => {
          if (functionName in RPC_ARGUMENTS) {
            if (options.userId) {
              return Promise.resolve({
                count: null,
                data: null,
                error: postgrestError(
                  new Error("Authenticated clients cannot call skill mutation RPCs"),
                ),
                status: 403,
                statusText: "Forbidden",
              });
            }
            return executeRpc(functionName, args);
          }
          const fallbackRpc = Reflect.get(target, "rpc", target) as (
            name: string,
            parameters?: Record<string, unknown>,
          ) => unknown;
          return fallbackRpc.call(target, functionName, args);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function isNeonApplicationTable(table: string): table is NeonTable {
  return table in TABLES;
}
