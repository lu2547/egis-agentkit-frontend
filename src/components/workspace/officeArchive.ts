import { Unzip, UnzipInflate } from 'fflate';

/** Reject ZIP variants and advertised expansion sizes that the preview cannot safely handle. */
export function checkOfficeArchive(buffer: ArrayBuffer): void {
  const data = new DataView(buffer);
  const fail = (): never => { throw new Error('无法安全预览此 Office 文件，请下载后查看。'); };
  const u16 = (offset: number) => data.getUint16(offset, true);
  const u32 = (offset: number) => data.getUint32(offset, true);
  if (data.byteLength < 22 || data.byteLength > 10 * 1024 * 1024) fail();
  let end = -1;
  for (let offset = data.byteLength - 22; offset >= Math.max(0, data.byteLength - 65557); offset--) {
    if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === data.byteLength) { end = offset; break; }
  }
  if (end < 0 || u16(end + 4) !== 0 || u16(end + 6) !== 0) fail();
  const count = u16(end + 10), size = u32(end + 12), start = u32(end + 16);
  if (count === 0xffff || count !== u16(end + 8) || count > 1000 || size === 0xffffffff || start === 0xffffffff || start + size !== end) fail();
  let position = start, total = 0;
  for (let i = 0; i < count; i++) {
    if (position + 46 > end || u32(position) !== 0x02014b50) fail();
    const flags = u16(position + 8), method = u16(position + 10), compressed = u32(position + 20), expanded = u32(position + 24);
    const nameLength = u16(position + 28), extraLength = u16(position + 30), commentLength = u16(position + 32), local = u32(position + 42);
    const next = position + 46 + nameLength + extraLength + commentLength;
    if ((flags & 0x41) || u16(position + 34) !== 0 || ![0, 8].includes(method) || compressed === 0xffffffff || expanded === 0xffffffff || local === 0xffffffff || next > end || local + 30 > start || u32(local) !== 0x04034b50) fail();
    if (u16(local + 6) !== flags || u16(local + 8) !== method || local + 30 + u16(local + 26) + u16(local + 28) + compressed > start) fail();
    // ZIP64 extra fields are rejected even when 32-bit fields happen to be present.
    const checkExtra = (offset: number, length: number) => {
      const limit = offset + length;
      while (offset < limit) {
        if (offset + 4 > limit) fail();
        const fieldLength = u16(offset + 2);
        if (u16(offset) === 1 || offset + 4 + fieldLength > limit) fail();
        offset += 4 + fieldLength;
      }
    };
    checkExtra(position + 46 + nameLength, extraLength);
    checkExtra(local + 30 + u16(local + 26), u16(local + 28));
    total += expanded;
    if (expanded > 20 * 1024 * 1024 || total > 50 * 1024 * 1024) fail();
    position = next;
  }
  if (position !== end) fail();
  // Verify actual output too: ZIP directory sizes are attacker-controlled.
  let actualTotal = 0, actualCount = 0;
  const unzip = new Unzip(file => {
    actualCount++;
    if (actualCount > count) fail();
    let actualSize = 0;
    file.ondata = (error, chunk) => {
      if (error) fail();
      actualSize += chunk.length;
      actualTotal += chunk.length;
      if (actualSize > 20 * 1024 * 1024 || actualTotal > 50 * 1024 * 1024) fail();
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  const bytes = new Uint8Array(buffer);
  for (let offset = 0; offset < start; offset += 4096) unzip.push(bytes.subarray(offset, Math.min(offset + 4096, start)), false);
  unzip.push(bytes.subarray(start), true);
  if (actualCount !== count) fail();
}
