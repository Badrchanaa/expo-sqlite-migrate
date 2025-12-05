export function promisify<T>(
  fn: (...args: any[]) => any,
  context: any,
): (...args: any[]) => Promise<T> {
  return (...args: any[]) => {
    return new Promise((resolve, reject) => {
      try {
        fn.call(context, ...args, (err: any, result: T) => {
          if (err) reject(err);
          else resolve(result);
        });
      } catch (e) {
        reject(e);
      }
    });
  };
}
