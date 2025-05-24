import localFont from "next/font/local";
import "./globals.css";
import { Web3Provider } from "@/provider/web3-provider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata = {
  title: "Millionaire's Dilemma : Yacht Edition",
  description: "A premium yacht experience for the financial elite",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <Web3Provider>
          <div className="min-h-screen relative">
            {/* Floating yacht silhouettes */}
            <div className="absolute bottom-0 left-0 w-full h-32 opacity-20 z-0 pointer-events-none">
              <div className="absolute bottom-10 left-[10%] w-64 h-16 bg-[url('https://cdn-icons-png.flaticon.com/512/9752/9752709.png')] bg-contain bg-no-repeat"></div>
              <div className="absolute bottom-20 right-[15%] w-80 h-20 bg-[url('https://cdn-icons-png.flaticon.com/512/9752/9752728.png')] bg-contain bg-no-repeat"></div>
            </div>
            {children}
          </div>
        </Web3Provider>
      </body>
    </html>
  );
}
