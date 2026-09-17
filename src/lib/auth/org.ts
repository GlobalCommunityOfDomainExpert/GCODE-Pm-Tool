import { prisma } from "@/lib/prisma";

// v0.2 supports exactly one organization per deployment (no org-switching) -
// see the data model note in the spec. Every auth flow resolves against
// whichever single Organization row exists, rather than routing by subdomain
// or an org id the client would otherwise have to supply.
export async function getTheOrganization() {
  return prisma.organization.findFirst();
}
