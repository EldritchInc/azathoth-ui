import { Link, NavLink, type LinkProps, type NavLinkProps } from "react-router";

import { usePage } from "../scope";

/**
 * A link to one of the pages of the instance the page acts on (ADR 0009).
 *
 * `to` is the page's path as the local instance has it, such as
 * `/workflows/<id>`; another instance's is under its own pages. A link to
 * one of the editor's own pages, such as its remotes, is a plain `Link`.
 */
export function InstanceLink({ to, ...rest }: Omit<LinkProps, "to"> & { readonly to: string }) {
  const page = usePage();

  return <Link to={page(to)} {...rest} />;
}

/** A navigation link to one of the instance's pages, marked while it is the page shown. */
export function InstanceNavLink({
  to,
  ...rest
}: Omit<NavLinkProps, "to"> & { readonly to: string }) {
  const page = usePage();

  return <NavLink to={page(to)} {...rest} />;
}
