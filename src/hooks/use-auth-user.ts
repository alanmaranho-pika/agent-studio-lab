
/**
 * Reactive Supabase user. `undefined` = still loading, `null` = signed-out.
 * Use `signedIn` for boolean checks once `loading` is false.
 */
export function useAuthUser() {
  return {
    user: { id: "local-user" },
    loading: false,
    signedIn: true,
  };
}
