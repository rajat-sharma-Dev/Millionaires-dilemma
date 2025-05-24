"use client";

/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
import { createWeb3Modal } from "@web3modal/wagmi/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { useState, useEffect } from "react";
import { defaultWagmiConfig } from "@web3modal/wagmi/react/config";
import { baseSepolia } from "wagmi/chains";
import { Loader2, AlertTriangle } from "lucide-react";

const projectId = "be36d80bd82aef7bdb958bb467c3e570";

const initializeWeb3Modal = () => {
  try {
    const metadata = {
      name: "Millionaire&apos;s Dilemma: Yacht Edition",
      description: "A luxury yacht experience for elite crypto investors",
      url: "https://millionairesdilemma.yacht",
      icons: ["https://img.icons8.com/pulsar-color/96/yacht.png"],
    };

    const chains = [baseSepolia];

    const wagmiConfig = defaultWagmiConfig({
      chains,
      projectId,
      metadata,
    });

    createWeb3Modal({
      wagmiConfig,
      projectId,
      chains,
      enableAnalytics: true,
      themeMode: "dark",
      chainImages: {
        [baseSepolia.id]:
          "https://images.mirror-media.xyz/publication-images/cgqxxPdUFBDjgKna_dDir.png?height=1200&width=1200",
      },
    });

    console.log("Web3Modal initialized successfully");
    return wagmiConfig;
  } catch (error) {
    console.error("Failed to initialize Web3Modal:", error);
    throw error;
  }
};

export function Web3Provider({ children, initialState }) {
  const [queryClient] = useState(() => new QueryClient());
  const [wagmiConfig, setWagmiConfig] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!initialized) {
      try {
        const config = initializeWeb3Modal();
        setWagmiConfig(config);
        setInitialized(true);
      } catch (err) {
        console.error("Web3Provider initialization error:", err);
        setError(err);
      }
    }
  }, [initialized]);

  const renderLoadingState = () => (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <div className="text-center">
        {error ? (
          <div className="w-20 h-20 mx-auto mb-6 relative">
            <div className="absolute inset-0 rounded-full border-4 border-[#e8505b] opacity-50"></div>
            <AlertTriangle className="absolute inset-0 m-auto text-[#e8505b]" size={36} />
          </div>
        ) : (
          <div className="relative w-24 h-24 mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-t-transparent border-[#e0a955] animate-spin"></div>
            <div className="absolute inset-2 rounded-full border-4 border-t-transparent border-[#1f5d88] animate-spin animate-[spin_1.5s_linear_infinite]"></div>
          </div>
        )}

        <h2 className="text-3xl font-bold text-[#e0a955] mb-2">Millionaire&apos;s Dilemma</h2>
        <p className="text-white/80 text-lg italic mb-4">Yacht Edition</p>
        
        <p className="text-xl mb-4 text-white">
          {error ? "Wallet Connection Error" : "Preparing Your Yacht..."}
        </p>
        
        {error && (
          <div className="bg-[#e8505b]/10 border border-[#e8505b]/50 text-[#e8505b] p-4 rounded-lg mt-4 flex items-center justify-center max-w-md mx-auto backdrop-blur-sm">
            <AlertTriangle className="mr-2 flex-shrink-0" />
            <span>{error.message}</span>
          </div>
        )}
      </div>
    </div>
  );

  if (error) {
    return renderLoadingState();
  }

  if (!initialized || !wagmiConfig) {
    return renderLoadingState();
  }

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
