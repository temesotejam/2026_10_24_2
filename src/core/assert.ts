/** Guard an invariant at subsystem boundaries instead of hiding it with a type assertion. */
export function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("必要なデータまたは画面要素が見つかりません");
  return value;
}
