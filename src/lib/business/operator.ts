interface SearchableOrganization {
  orgId: string;
  name: string;
}

/** Stable, readable organization number derived from the immutable UUID. */
export function organizationNumber(orgId: string): string {
  const compact = orgId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `ORG-${compact || 'UNKNOWN'}`;
}

/** Match an operator query against organization name, short number, or UUID. */
export function matchesOrganization(
  organization: SearchableOrganization,
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase('id-ID');
  if (!needle) return true;

  return [
    organization.name,
    organization.orgId,
    organizationNumber(organization.orgId),
  ].some((value) => value.toLocaleLowerCase('id-ID').includes(needle));
}
