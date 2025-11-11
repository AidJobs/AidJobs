export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Login page handles its own styling, so we just pass through
  return <>{children}</>;
}
