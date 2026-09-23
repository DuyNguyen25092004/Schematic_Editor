import { GRID } from '../constants';

// Hàm quy đổi toạ độ về đơn vị lưới nguyên — DÙNG CHUNG cho mọi nơi so sánh điểm
export function toGridUnit(v) {
  return Math.round(v / GRID);
}

// So sánh 2 điểm bằng số nguyên lưới tuyệt đối — không còn phụ thuộc ngưỡng khoảng cách nữa
export function sameGridPoint(a, b) {
  return toGridUnit(a.x) === toGridUnit(b.x) && toGridUnit(a.y) === toGridUnit(b.y);
}