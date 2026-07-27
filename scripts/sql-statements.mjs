export function splitSqlStatements(source) {
  const statements = [];
  let statementStart = 0;
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let blockCommentDepth = 0;
  let dollarQuote = null;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (current === "\n") inLineComment = false;
      index += 1;
      continue;
    }

    if (blockCommentDepth > 0) {
      if (current === "/" && next === "*") {
        blockCommentDepth += 1;
        index += 2;
      } else if (current === "*" && next === "/") {
        blockCommentDepth -= 1;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    if (dollarQuote) {
      if (source.startsWith(dollarQuote, index)) {
        index += dollarQuote.length;
        dollarQuote = null;
      } else {
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (current === "'" && next === "'") {
        index += 2;
      } else if (current === "'") {
        inSingleQuote = false;
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (current === '"' && next === '"') {
        index += 2;
      } else if (current === '"') {
        inDoubleQuote = false;
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (current === "-" && next === "-") {
      inLineComment = true;
      index += 2;
      continue;
    }
    if (current === "/" && next === "*") {
      blockCommentDepth = 1;
      index += 2;
      continue;
    }
    if (current === "'") {
      inSingleQuote = true;
      index += 1;
      continue;
    }
    if (current === '"') {
      inDoubleQuote = true;
      index += 1;
      continue;
    }
    if (current === "$") {
      const tag = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (tag) {
        dollarQuote = tag;
        index += tag.length;
        continue;
      }
    }
    if (current === ";") {
      const statement = source.slice(statementStart, index).trim();
      if (statement) statements.push(statement);
      statementStart = index + 1;
    }

    index += 1;
  }

  const trailingStatement = source.slice(statementStart).trim();
  if (trailingStatement) statements.push(trailingStatement);

  if (inSingleQuote || inDoubleQuote || dollarQuote || blockCommentDepth > 0) {
    throw new Error("[neon-migration] schema contains an unterminated SQL construct");
  }

  return statements;
}
