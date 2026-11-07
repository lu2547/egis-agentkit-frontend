/** Incremental WHATWG SSE framing. Event data is passed unchanged to the SDK. */
export class SseDecoder {
  private decoder = new TextDecoder();
  private line = "";
  private data: string[] = [];
  private id: string | undefined;
  private skipLf = false;
  push(bytes: Uint8Array): { data: string; id?: string }[] {
    const frames: { data: string; id?: string }[] = [];
    for (const char of this.decoder.decode(bytes, { stream: true })) {
      if (this.skipLf && char === "\n") {
        this.skipLf = false;
        continue;
      }
      this.skipLf = char === "\r";
      if (char === "\r" || char === "\n") {
        if (!this.line) {
          if (this.data.length)
            frames.push({
              ...(this.id !== undefined ? { id: this.id } : {}),
              data: this.data.join("\n"),
            });
          this.data = [];
          this.id = undefined;
        } else if (!this.line.startsWith(":")) {
          const colon = this.line.indexOf(":");
          const field = colon < 0 ? this.line : this.line.slice(0, colon);
          let value = colon < 0 ? "" : this.line.slice(colon + 1);
          if (value.startsWith(" ")) value = value.slice(1);
          if (field === "data") this.data.push(value);
          if (field === "id" && !value.includes("\0")) this.id = value;
        }
        this.line = "";
      } else this.line += char;
    }
    return frames;
  }
}
