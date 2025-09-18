export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

export function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}

export function isPlainObject(value: unknown): value is Record<string, any> {
  return isObject(value) && value.constructor === Object;
}

export function isArray(value: unknown): value is Array<any> {
  return Array.isArray(value);
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

export function isRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp;
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

export function isPromise(value: unknown): value is Promise<any> {
  return value instanceof Promise || (
    isObject(value) && 
    isFunction((value as any).then)
  );
}

export function isNull(value: unknown): value is null {
  return value === null;
}

export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

export function isNil(value: unknown): value is null | undefined {
  return value == null;
}

export function isEmpty(value: unknown): boolean {
  if (isNil(value)) return true;
  if (isString(value) || isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  return false;
}

export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  
  if (isDate(a) && isDate(b)) {
    return a.getTime() === b.getTime();
  }
  
  if (isArray(a) && isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => isEqual(item, b[index]));
  }
  
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    return keysA.every(key => 
      keysB.includes(key) && isEqual(a[key], b[key])
    );
  }
  
  return false;
}

export function getType(value: unknown): string {
  if (isNull(value)) return 'null';
  if (isArray(value)) return 'array';
  if (isDate(value)) return 'date';
  if (isRegExp(value)) return 'regexp';
  if (isError(value)) return 'error';
  
  return typeof value;
}

export function assertType<T>(
  value: unknown,
  predicate: (value: unknown) => value is T,
  errorMessage?: string
): asserts value is T {
  if (!predicate(value)) {
    throw new TypeError(errorMessage || `Value does not match expected type`);
  }
}

export function coerce<T>(
  value: unknown,
  type: 'string' | 'number' | 'boolean'
): T {
  switch (type) {
    case 'string':
      return String(value) as T;
    case 'number':
      const num = Number(value);
      return (isNaN(num) ? 0 : num) as T;
    case 'boolean':
      return Boolean(value) as T;
    default:
      return value as T;
  }
}