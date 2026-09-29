import { Desk } from "@/components/Desk";

// Read on the server at build time, so the public deployment never ships a dial-out form
// that can only answer 403.
export default function Home() {
  return <Desk dialOut={process.env.DIAL_OUT_ENABLED === "1"} />;
}
