import Header from "./Header";
import { getAppVersion } from "@/lib/appVersion";

export default function HeaderServer() {
  const appVersion = getAppVersion();
  const gitSha = process.env.NEXT_PUBLIC_GIT_SHA ?? null;

  return <Header appVersion={appVersion} gitSha={gitSha} />;
}