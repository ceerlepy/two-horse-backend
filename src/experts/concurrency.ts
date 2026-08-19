export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn:
    (item: T) => Promise<R>
): Promise<R[]> {
  const results:
    R[] = [];

  let nextIndex = 0;

  async function worker():
    Promise<void> {
    while (true) {
      const index =
        nextIndex++;

      if (
        index >=
        items.length
      ) {
        return;
      }

      results[index] =
        await fn(
          items[index]
        );
    }
  }

  const workerCount =
    Math.min(
      limit,
      items.length
    );

  await Promise.all(
    Array.from(
      {
        length:
          workerCount
      },
      () => worker()
    )
  );

  return results;
}
