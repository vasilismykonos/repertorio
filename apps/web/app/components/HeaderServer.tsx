import Header from "./Header";
import { getAppVersion } from "@/lib/appVersion";

export default function HeaderServer() {
  const appVersion = getAppVersion();

  return <Header appVersion={appVersion} />;
}
