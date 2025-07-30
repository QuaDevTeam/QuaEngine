export function formatDate(date: Date, format: string): string {
  const map: Record<string, string> = {
    'YYYY': date.getFullYear().toString(),
    'YY': date.getFullYear().toString().slice(-2),
    'MM': String(date.getMonth() + 1).padStart(2, '0'),
    'M': String(date.getMonth() + 1),
    'DD': String(date.getDate()).padStart(2, '0'),
    'D': String(date.getDate()),
    'HH': String(date.getHours()).padStart(2, '0'),
    'H': String(date.getHours()),
    'mm': String(date.getMinutes()).padStart(2, '0'),
    'm': String(date.getMinutes()),
    'ss': String(date.getSeconds()).padStart(2, '0'),
    's': String(date.getSeconds()),
    'SSS': String(date.getMilliseconds()).padStart(3, '0'),
  };

  return format.replace(/YYYY|YY|MM|M|DD|D|HH|H|mm|m|ss|s|SSS/g, match => map[match]);
}

export function parseDate(dateString: string, format: string): Date {
  const formatTokens = format.match(/YYYY|YY|MM|M|DD|D|HH|H|mm|m|ss|s|SSS/g) || [];
  const dateTokens = dateString.match(/\d+/g) || [];
  
  if (formatTokens.length !== dateTokens.length) {
    throw new Error('Date string does not match format');
  }

  let year = new Date().getFullYear();
  let month = 0;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let millisecond = 0;

  formatTokens.forEach((token, index) => {
    const value = parseInt(dateTokens[index], 10);
    
    switch (token) {
      case 'YYYY':
        year = value;
        break;
      case 'YY':
        year = 2000 + value;
        break;
      case 'MM':
      case 'M':
        month = value - 1;
        break;
      case 'DD':
      case 'D':
        day = value;
        break;
      case 'HH':
      case 'H':
        hour = value;
        break;
      case 'mm':
      case 'm':
        minute = value;
        break;
      case 'ss':
      case 's':
        second = value;
        break;
      case 'SSS':
        millisecond = value;
        break;
    }
  });

  return new Date(year, month, day, hour, minute, second, millisecond);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function startOfWeek(date: Date, startOfWeek: number = 0): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day < startOfWeek ? 7 : 0) + day - startOfWeek;
  result.setDate(result.getDate() - diff);
  return startOfDay(result);
}

export function endOfWeek(date: Date, startOfWeekDay: number = 0): Date {
  const result = startOfWeek(date, startOfWeekDay);
  result.setDate(result.getDate() + 6);
  return endOfDay(result);
}

export function startOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setDate(1);
  return startOfDay(result);
}

export function endOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1, 0);
  return endOfDay(result);
}

export function diffInDays(dateLeft: Date, dateRight: Date): number {
  const diffTime = dateLeft.getTime() - dateRight.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function diffInHours(dateLeft: Date, dateRight: Date): number {
  const diffTime = dateLeft.getTime() - dateRight.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60));
}

export function diffInMinutes(dateLeft: Date, dateRight: Date): number {
  const diffTime = dateLeft.getTime() - dateRight.getTime();
  return Math.ceil(diffTime / (1000 * 60));
}

export function isAfter(date: Date, dateToCompare: Date): boolean {
  return date.getTime() > dateToCompare.getTime();
}

export function isBefore(date: Date, dateToCompare: Date): boolean {
  return date.getTime() < dateToCompare.getTime();
}

export function isSameDay(dateLeft: Date, dateRight: Date): boolean {
  return startOfDay(dateLeft).getTime() === startOfDay(dateRight).getTime();
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}