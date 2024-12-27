import { HeartRateSensor } from "heart-rate";

// Add zero in front of numbers < 10
export function zeroPad(i) {
  if (i < 10) {
    i = "0" + i;
  }
  return i;
}

export function zeroPadstep(i) {
  let str = i.toString()
  while (str.length < 5) {
    str = "0" + str;
  }
  return str;
}

export function zeroPadcal(i) {
  let str = i.toString()
  while (str.length < 4) {
    str = "0" + str;
  }
  return str;
}

export function getDateString(dateObj){
  let day = ["일", "월", "화", "수", "목", "금", "토"];
  let month = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  
  let year = dateObj.getFullYear();
  let dt = zeroPad(dateObj.getDate());
  let week = day[dateObj.getDay()];
  let mon = month[dateObj.getMonth()];
  
  return `${year}년 ${mon}월 ${dt}일 ${week}`;
}

export function getTimeString(dateObj){
  let hours = monoDigits(zeroPad(dateObj.getHours()));
  let mins = monoDigits(zeroPad(dateObj.getMinutes()));

  return `${hours}:${mins}`;
}

// Convert a number to a special monospace number
export function monoDigits(digits) {
  var ret = "";
  var str = digits.toString();
  for (var index = 0; index < str.length; index++) {
    var num = str.charAt(index);
    ret = ret.concat(hex2a("0x1" + num));
  }
  return ret;
}

// Hex to string
export function hex2a(hex) {
  var str = '';
  for (var index = 0; index < hex.length; index += 2) {
    var val = parseInt(hex.substr(index, 2), 16);
    if (val) str += String.fromCharCode(val);
  }
  return str.toString();
}