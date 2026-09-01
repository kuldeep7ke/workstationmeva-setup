import express, { Router } from 'express';

// Express 4 does not forward rejected promises from async route handlers to the
// error middleware - an `await` failure leaves the client hanging with no
// response. Wrap every route/middleware function so rejections reach `next(err)`.
// This module MUST be imported before any route registration (first import in index.ts).

type Handler = (...args: any[]) => any;

function wrap(fn: Handler): Handler {
  return function (this: any, ...args: any[]) {
    const next = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined;
    try {
      const result = fn.apply(this, args);
      if (next && result && typeof result.then === 'function') {
        result.then(
          () => {},
          (err: any) => next(err)
        );
      }
      return result;
    } catch (err) {
      if (next) next(err);
      else throw err;
    }
  };
}

function wrapArgs(args: any[]): any[] {
  return args.map((a) => {
    if (typeof a === 'function' && a.length !== 4) return wrap(a);
    if (Array.isArray(a)) return a.map((x) => (typeof x === 'function' && x.length !== 4 ? wrap(x) : x));
    return a;
  });
}

function patch(target: any): void {
  const methods = ['use', 'get', 'post', 'put', 'delete', 'patch', 'all'] as const;
  for (const m of methods) {
    if (typeof target[m] !== 'function') continue;
    const orig = target[m];
    target[m] = function (this: any, ...args: any[]) {
      return orig.apply(this, wrapArgs(args));
    };
  }
}

// express 4.19+ moved route methods onto the Router constructor itself;
// earlier versions define them on Router.prototype. Patch both, plus the app.
patch(Router);
patch(Router.prototype);
const appRef: any = (express as any).application || express;
patch(appRef);
