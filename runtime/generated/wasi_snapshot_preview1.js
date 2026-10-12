// Minimal wasi_snapshot_preview1 implementation for the web runtime bridge.
// The operit_flutter_bridge wasm module links real WASI (wasi_snapshot_preview1),
// so wasm-bindgen does not emit the shim itself; this module implements the
// imports the module actually declares. The runtime bridge publishes the wasm
// memory through setWasiMemory() before instantiating the module.
let memory = null;
let view = null;

function viewFor(buffer) {
  return new DataView(buffer);
}

export function setWasiMemory(wasmMemory) {
  memory = wasmMemory;
  view = viewFor(memory.buffer);
}

function activeView() {
  if (view === null || view.buffer !== memory.buffer) {
    view = viewFor(memory.buffer);
  }
  return view;
}

// WASI errno values (subset).
const WASI_ERRNO_SUCCESS = 0;

// fd_write: write iovecs from wasm memory to stdout/stderr and report the
// number of bytes written back through the nwritten pointer.
export function fd_write(fd, iovsPtr, iovsLen, nwrittenPtr) {
  const buffer = memory.buffer;
  const dv = new DataView(buffer);
  let written = 0;
  for (let i = 0; i < iovsLen; i += 1) {
    const basePtr = dv.getUint32(iovsPtr + i * 8, true);
    const length = dv.getUint32(iovsPtr + i * 8 + 4, true);
    if (length === 0) {
      continue;
    }
    const bytes = new Uint8Array(buffer, basePtr, length);
    const text = new TextDecoder().decode(bytes);
    if (fd === 2) {
      console.error(text);
    } else {
      console.log(text);
    }
    written += length;
  }
  dv.setUint32(nwrittenPtr, written, true);
  return WASI_ERRNO_SUCCESS;
}

// clock_time_get: write the current time in nanoseconds to the wasm memory.
export function clock_time_get(clockId, _precision, outPtr) {
  const nowNs = BigInt(Math.round(Date.now() * 1e6));
  activeView().setBigUint64(outPtr, nowNs, true);
  return WASI_ERRNO_SUCCESS;
}

// clock_res_get: write a 1ns resolution.
export function clock_res_get(clockId, outPtr) {
  activeView().setBigUint64(outPtr, 1n, true);
  return WASI_ERRNO_SUCCESS;
}

// fd_close: succeed without closing anything (the fds are emulated).
export function fd_close(_fd) {
  return WASI_ERRNO_SUCCESS;
}

// fd_seek: report no movement; the JS runtime owns real filesystem state.
export function fd_seek(_fd, _offsetBigInt, _whence, outPtr) {
  activeView().setBigUint64(outPtr, 0n, true);
  return WASI_ERRNO_SUCCESS;
}

// fd_fdstat_get: report a character device (8-byte fdstat struct).
// Struct: filetype (u8), flags (u16), rights base (u64), rights inheriting (u64)
export function fd_fdstat_get(_fd, fdstatPtr) {
  const dv = activeView();
  dv.setUint8(fdstatPtr, 2); // __WASI_FILETYPE_CHARACTER_DEVICE
  dv.setUint16(fdstatPtr + 2, 0, true);
  dv.setBigUint64(fdstatPtr + 8, 0n, true);
  dv.setBigUint64(fdstatPtr + 16, 0n, true);
  return WASI_ERRNO_SUCCESS;
}

// environ_get / environ_sizes_get: report zero environment variables.
export function environ_get(environPtr, environBufPtr) {
  activeView().setUint32(environPtr, environBufPtr, true);
  return WASI_ERRNO_SUCCESS;
}

export function environ_sizes_get(environCountPtr, environBufSizePtr) {
  const dv = activeView();
  dv.setUint32(environCountPtr, 0, true);
  dv.setUint32(environBufSizePtr, 0, true);
  return WASI_ERRNO_SUCCESS;
}

// random_get: fill the buffer with cryptographically random bytes.
export function random_get(bufPtr, bufLen) {
  const bytes = new Uint8Array(memory.buffer, bufPtr, bufLen);
  crypto.getRandomValues(bytes);
  return WASI_ERRNO_SUCCESS;
}

// sched_yield: cooperative yield is a no-op on the web.
export function sched_yield() {
  return WASI_ERRNO_SUCCESS;
}

// args_get / args_sizes_get: report zero arguments.
export function args_get(argvPtr, argvBufPtr) {
  activeView().setUint32(argvPtr, argvBufPtr, true);
  return WASI_ERRNO_SUCCESS;
}

export function args_sizes_get(argcPtr, argvBufSizePtr) {
  const dv = activeView();
  dv.setUint32(argcPtr, 0, true);
  dv.setUint32(argvBufSizePtr, 0, true);
  return WASI_ERRNO_SUCCESS;
}

// proc_exit: unreachable in the web host; log and swallow.
export function proc_exit(code) {
  throw new Error(`wasi proc_exit called with code ${code}`);
}

export default {
  setWasiMemory,
  fd_write,
  clock_time_get,
  clock_res_get,
  fd_close,
  fd_seek,
  fd_fdstat_get,
  environ_get,
  environ_sizes_get,
  random_get,
  sched_yield,
  args_get,
  args_sizes_get,
  proc_exit,
};
