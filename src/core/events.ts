/** EventTarget does not observe rejected async listeners. Always consume failures. */
export function asyncEvent(handler: (event: Event) => Promise<void>): (event: Event) => void {
  return (event) => {
    void handler(event).catch((error: unknown) => {
      console.error("操作を完了できませんでした", error);
    });
  };
}
