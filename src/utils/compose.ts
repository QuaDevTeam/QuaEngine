import { Middleware, MiddlewareContext } from '../types/pipeline';

export const compose = (middlewares: Middleware[]) => {
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
