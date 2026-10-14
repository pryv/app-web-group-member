/**
 * The one place this app imports the Pryv client libraries from.
 *
 * Every other module goes through this file, so a fork that wraps the client
 * (or a test that stubs it) replaces one module.
 */
import Pryv from "pryv";
// Imported, then exported: `@pryv/cmc` is CommonJS, and the Vite dev server
// applies its CommonJS interop to imports only.
import * as cmcModule from "@pryv/cmc";

export { Pryv };
export const cmc = cmcModule;
export { errorIds as cmcErrorIds, CmcError } from "@pryv/cmc";
export type {
  CmcActor,
  InviteRecord,
  InviteStatus,
  MemberAccess,
  MembershipRequest,
  Permission,
} from "@pryv/cmc";

/** A `pryv.Connection`. */
export type Connection = InstanceType<typeof Pryv.Connection>;
/** A `pryv.Service`. */
export type Service = InstanceType<typeof Pryv.Service>;
