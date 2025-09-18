export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate: boolean = false
): T & { cancel: () => void } {
  let timeout: NodeJS.Timeout | null = null;
  let result: ReturnType<T>;

  const debounced = function (this: any, ...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) result = func.apply(this, args);
    };

    const callNow = immediate && !timeout;
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    
    if (callNow) result = func.apply(this, args);
    
    return result;
  } as T & { cancel: () => void };

  debounced.cancel = function() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): T & { cancel: () => void } {
  const { leading = true, trailing = true } = options;
  let timeout: NodeJS.Timeout | null = null;
  let previous = 0;
  let result: ReturnType<T>;

  const throttled = function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    
    if (!previous && !leading) previous = now;
    
    const remaining = wait - (now - previous);
    
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      result = func.apply(this, args);
    } else if (!timeout && trailing) {
      timeout = setTimeout(() => {
        previous = leading ? Date.now() : 0;
        timeout = null;
        result = func.apply(this, args);
      }, remaining);
    }
    
    return result;
  } as T & { cancel: () => void };

  throttled.cancel = function() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    previous = 0;
  };

  return throttled;
}

export function once<T extends (...args: any[]) => any>(func: T): T {
  let called = false;
  let result: ReturnType<T>;

  return ((...args: Parameters<T>) => {
    if (!called) {
      called = true;
      result = func(...args);
    }
    return result;
  }) as T;
}

export function memoize<T extends (...args: any[]) => any>(
  func: T,
  resolver?: (...args: Parameters<T>) => string
): T & { cache: Map<string, ReturnType<T>>; clear: () => void } {
  const cache = new Map<string, ReturnType<T>>();

  const memoized = function (...args: Parameters<T>): ReturnType<T> {
    const key = resolver ? resolver(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const result = func(...args);
    cache.set(key, result);
    return result;
  } as T & { cache: Map<string, ReturnType<T>>; clear: () => void };

  memoized.cache = cache;
  memoized.clear = () => cache.clear();

  return memoized;
}

export function curry<T extends (...args: any[]) => any>(
  func: T,
  arity: number = func.length
): any {
  return function curried(...args: any[]): any {
    if (args.length >= arity) {
      return func(...args);
    }
    return (...nextArgs: any[]) => curried(...args, ...nextArgs);
  };
}

export function pipe<T>(...functions: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => functions.reduce((result, fn) => fn(result), arg);
}

export function compose<T>(...functions: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => functions.reduceRight((result, fn) => fn(result), arg);
}

export function partial<T extends (...args: any[]) => any>(
  func: T,
  ...partialArgs: any[]
): (...remainingArgs: any[]) => ReturnType<T> {
  return (...remainingArgs: any[]) => func(...partialArgs, ...remainingArgs);
}

export function negate<T extends (...args: any[]) => boolean>(
  predicate: T
): T {
  return ((...args: Parameters<T>) => !predicate(...args)) as T;
}

export function retry<T extends (...args: any[]) => Promise<any>>(
  func: T,
  maxAttempts: number,
  delay: number = 0
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await func(...args);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxAttempts) {
          throw lastError;
        }
        
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  };
}