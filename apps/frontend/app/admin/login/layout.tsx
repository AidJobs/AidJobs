export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FEECE4] antialiased">
      {children}
    </div>
  );
}
