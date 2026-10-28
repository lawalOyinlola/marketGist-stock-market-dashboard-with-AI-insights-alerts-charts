import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getAuth } from "@/lib/better-auth/auth";
import { headers } from "next/headers";
import { NotificationPoller } from "@/components/NotificationPoller";
import { getWatchlistSymbolsByEmail } from "@/lib/utils/watchlist-symbols";
import { getAlertsByEmail } from "@/lib/actions/alert.actions";
import GuestWrapper from "@/components/GuestWrapper";
// Defer heavy Finnhub fetches to the client to avoid blocking SSR

const Layout = async ({ children }: { children: React.ReactNode }) => {
  // Read headers first so Next.js marks the route as dynamic before any
  // database work, which lets `next build` run without env vars.
  const requestHeaders = await headers();
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: requestHeaders });

  // Make authentication optional - allow guest access
  const user = session?.user
    ? {
        id: session.user.id,
        name: session.user.name ?? undefined,
        email: session.user.email,
      }
    : null;

  // Preload only lightweight data (symbols, alerts). Defer Finnhub data to client.
  const [initialWatchlistSymbols, initialAlerts] = session?.user?.email
    ? await Promise.all([
        getWatchlistSymbolsByEmail(session.user.email),
        getAlertsByEmail(session.user.email),
      ])
    : ([[], []] as [string[], AlertData[]]);

  return (
    <main className="min-h-screen text-gray-400 flex flex-col">
      <GuestWrapper
        initialWatchlistSymbols={initialWatchlistSymbols}
        initialWatchlistData={[]}
        initialAlerts={initialAlerts}
        authenticatedEmail={session?.user?.email}
      >
        {session?.user && <NotificationPoller />}
        <Header user={user} />
        <div className="container py-10 flex-1">{children}</div>
        <Footer />
      </GuestWrapper>
    </main>
  );
};
export default Layout;
