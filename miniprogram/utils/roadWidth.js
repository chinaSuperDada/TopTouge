/**
 * 路宽选项。上传页与录制页共用，避免两边各写一份。
 * value 必须与后端 constants.js 的 ROAD_WIDTHS 一致。
 */
const ROAD_WIDTH_OPTIONS = [
  { value: 'narrow', label: '窄' },
  { value: 'medium', label: '中' },
  { value: 'wide', label: '宽' }
]

const ROAD_WIDTH_LABELS = ROAD_WIDTH_OPTIONS.map((o) => o.label)

module.exports = { ROAD_WIDTH_OPTIONS, ROAD_WIDTH_LABELS }
