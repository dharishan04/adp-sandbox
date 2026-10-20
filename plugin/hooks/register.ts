import type { Register } from 'claude-code'
import { probe } from '../rules/src/probe.ts'
export const register: Register = on => {
  on('session.start', ($, e, next) => { $.ui.status(probe()); return next(e) })
}
