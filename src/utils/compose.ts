import { Middleware, MiddlewareContext } from '../types/pipeline';

export const compose = (middlewares: Middleware[]) => {
  if (!Array.isArray(middlewares)) {
    throw new TypeError('Middlewares must be an array!');
  }
  for (const middleware of middlewares) {
    if (typeof middleware !== 'function') {
      throw new TypeError('Middlewares must be composed of functions!');
    }
  }
  return function (context: MiddlewareContext, next: Middleware) {
    let index = -1;
    return dispatch(0);
    function dispatch(i: number): Promise<void> {
      if (i <= index) {
        return Promise.reject(new Error('next() was called multiple times.'));
      }
      index = i;
      let middleware = middlewares[i];
      if (i === middlewares.length) {
        middleware = next;
      }
      if (!middleware) {
        return Promise.resolve();
      }
      try {
        return Promise.resolve(middleware(context, dispatch.bind(null, i + 1)));
      } catch (err: unknown) {
        return Promise.reject(err);
      }
    }
  };
};
