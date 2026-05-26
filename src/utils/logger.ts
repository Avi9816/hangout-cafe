export function devLog(tag: string, ...args: any[]) {
  if (import.meta.env.DEV) {
    console.log(tag, ...args);
  }
}
