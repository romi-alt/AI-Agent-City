/** Whether this browser can draw the 3D city. Checked before the canvas mounts. */
export function detectWebGL(doc: Document = document): boolean {
  try {
    const c = doc.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
