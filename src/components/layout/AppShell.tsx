import { Outlet } from "react-router-dom";
import TopBar from "./TopBar";
import SideNav from "./SideNav";
import RightRail from "./RightRail";

export default function AppShell() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <div className="flex-1 mx-auto w-full max-w-[1440px] px-3 md:px-6 py-4 grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_320px] gap-6">
        <aside className="hidden lg:block sticky top-20 self-start">
          <SideNav />
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
        <aside className="hidden lg:block sticky top-20 self-start">
          <RightRail />
        </aside>
      </div>
    </div>
  );
}
