export const formatRuntime = (seconds?: number | null): string => {
  if (seconds === undefined || seconds === null || isNaN(seconds) || seconds <= 0) {
    return '';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
