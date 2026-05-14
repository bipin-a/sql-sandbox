const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DATALEMUR_TIMESTAMP_PATTERN =
  /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/;

export function parseTimestampText(value: string): Date {
  const trimmed = value.trim();

  if (DATALEMUR_TIMESTAMP_PATTERN.test(trimmed)) {
    const [datePart, timePart] = trimmed.split(" ");
    const [month, day, year] = datePart.split("/");
    return new Date(`${year}-${month}-${day}T${timePart}Z`);
  }

  return new Date(trimmed);
}

export function isSupportedTimestampText(value: string): boolean {
  const trimmed = value.trim();
  if (
    !ISO_TIMESTAMP_PATTERN.test(trimmed) &&
    !DATALEMUR_TIMESTAMP_PATTERN.test(trimmed)
  ) {
    return false;
  }

  return !Number.isNaN(parseTimestampText(trimmed).getTime());
}
