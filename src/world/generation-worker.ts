import type { Dimension, GeneratorVersion } from "./adventure-terrain";
import { generateChunk } from "./terrain";

/** Web Worker entry point: terrain generation off the main thread. One
 * message in ({cx, cz, seed}), one chunk buffer out, transferred (not
 * copied) back to the main thread. */

interface GenerateRequest {
  cx: number;
  cz: number;
  seed: number;
  dimension?: Dimension;
  revision?: GeneratorVersion;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<GenerateRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { cx, cz, seed, dimension, revision } = event.data;
  const chunk = generateChunk(cx, cz, seed, dimension, revision);
  const buffer = chunk.buffer;
  scope.postMessage({ cx, cz, buffer }, [buffer.buffer]);
};
