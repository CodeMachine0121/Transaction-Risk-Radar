/** 將數值限制在 [minimum, maximum] 區間內。供 normalize 等風險指標計算使用。 */
export function clamp(value: number, minimum: number, maximum: number): number {
  if (value < minimum) {
    return minimum;
  }
  if (value > maximum) {
    return maximum;
  }
  return value;
}
