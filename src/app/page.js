"use client";

import { useAccount } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { useDisconnect } from "wagmi";
import { useEffect, useState } from "react";
import { Wallet, LogOut, User, Calculator, ArrowLeft, ChevronsRight, UserPlus } from "lucide-react";
import GameSelector from "@/components/game-selector";
import PlayerSelector from "@/components/player-selector";
import BalanceInput from "@/components/balance-input";
import GameStateActions from "@/components/game-state-actions";

export default function Home() {
  const { isConnected, address } = useAccount();
  const { open } = useWeb3Modal();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerHistory, setPlayerHistory] = useState([]);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle the disconnect action
  const handleDisconnect = () => {
    try {
      disconnect();
      setSelectedGame(null);
      setTimeout(() => {
        window.location.reload();
      }, 100);
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  };

  // Handler for the connect button
  const handleConnect = () => {
    try {
      console.log("Connecting wallet...");
      open();
    } catch (error) {
      console.error("Connect error:", error);
    }
  };
  
  // Handler for selecting a game
  const handleSelectGame = (gameAddress) => {
    console.log("Selected game:", gameAddress);
    setSelectedGame(gameAddress);
    // Reset player selection when selecting a new game
    setSelectedPlayer(null);
    setPlayerHistory([]);
  };
  
  // Handler for going back to game selection
  const handleBackToSelection = () => {
    setSelectedGame(null);
    setSelectedPlayer(null);
    setPlayerHistory([]);
  };
  
  // Handler for player selection
  const handlePlayerSelected = (playerName) => {
    console.log("Selected player:", playerName);
    setSelectedPlayer(playerName);
    // Add to player history if not already there
    if (!playerHistory.includes(playerName)) {
      setPlayerHistory(prev => [...prev, playerName]);
    }
  };

  // Handler for going back to player selection
  const handleBackToPlayerSelection = () => {
    setSelectedPlayer(null);
  };
  
  // Handler for when balance is submitted
  const handleBalanceSubmitted = () => {
    console.log("Balance submitted!");
    // Go back to player selection to allow selecting another player
    setSelectedPlayer(null);
  };

  if (!mounted)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="relative w-24 h-24 mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-t-transparent border-[#e0a955] animate-spin"></div>
          <div className="absolute inset-2 rounded-full border-4 border-t-transparent border-[#1f5d88] animate-spin animate-[spin_1.5s_linear_infinite]"></div>
        </div>
        <h2 className="text-3xl font-bold text-[#e0a955] mb-2">Millionaire's Dilemma</h2>
        <p className="text-white/80 text-lg italic">Yacht Edition</p>
        <p className="text-white/60 mt-4 animate-pulse">Preparing your luxury experience...</p>
      </div>
    );

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-6 relative z-10">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-10 gap-4">
          <div className="flex flex-col items-center sm:items-start mb-4 sm:mb-0">
            <div className="flex items-center gap-3 mb-1">
              <div className="relative">
                <div className="w-12 h-12 bg-gradient-to-br from-[#1f5d88]/30 to-[#0e1e32]/80 rounded-full flex items-center justify-center border border-[#e0a955]/40 shadow-[0_0_10px_rgba(224,169,85,0.15)]">
                  <Calculator className="text-[#e0a955] w-6 h-6" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#e8505b] rounded-full animate-pulse shadow-[0_0_5px_rgba(232,80,91,0.5)]"></div>
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-white via-white to-white/80 text-transparent bg-clip-text">
                {selectedGame ? "Yacht Balance" : "Millionaire's Dilemma"}
              </h1>
            </div>
            <p className="text-[#e0a955] italic font-medium ml-14 sm:ml-16">Yacht Edition</p>
          </div>
          <div>
            {isConnected ? (
              <div className="yacht-container flex items-center gap-4 p-3 shadow-xl">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#1f5d88] flex items-center justify-center p-1.5 shadow-inner">
                    <User className="text-[#e0a955] w-full h-full" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-[#e0a955]/70 uppercase tracking-wider">Millionaire</span>
                    <span className="text-sm text-white font-medium truncate max-w-[120px]">
                      {address?.substring(0, 6)}...{address?.substring(address.length - 4)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="bg-gradient-to-r from-[#e8505b] to-[#e93748] hover:from-[#d04550] hover:to-[#c73140] text-white px-4 py-1.5 rounded-md shadow-lg transition-all hover:shadow-xl hover:scale-105 flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="font-medium">Exit</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnect}
                className="luxury-button"
              >
                <Wallet className="w-5 h-5" />
                <span>Board the Yacht</span>
              </button>
            )}
          </div>
        </div>

        {isConnected ? (
          <div className="w-full mt-10 relative yacht-container p-8">
            {selectedGame ? (
              <div>
                <div className="mb-6">
                  <button 
                    onClick={handleBackToSelection}
                    className="ocean-button flex items-center gap-2 text-sm border border-[#2a7dad]/30"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Return to Yacht Selection
                  </button>
                </div>
                <div className="bg-[#0e1e32]/60 border border-[#1f5d88]/40 rounded-lg p-4 mb-6 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-[#1f5d88] flex items-center justify-center mr-3">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-[#e0a955]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 8V3m0 5a4 4 0 100 8 4 4 0 000-8z"/>
                        <path d="M17.3 15.9l2.5 3c.5.7 0 1.5-.8 1.5H5c-.8 0-1.3-.8-.8-1.5l2.5-3"/>
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs text-[#e0a955] uppercase tracking-wider mb-1 font-medium">Current Yacht</div>
                      <div className="text-white text-sm font-mono bg-[#07101d] py-1 px-2 rounded border border-[#1f5d88]/30">
                        {selectedGame.substring(0, 8)}...{selectedGame.substring(selectedGame.length - 8)}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Game State Indicator at the top of the page - always shown */}
                <div className="mb-6">
                  <GameStateActions 
                    gameAddress={selectedGame}
                    showActionButtons={false}
                  />
                </div>
                
                {selectedPlayer ? (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-6">
                      <button 
                        onClick={handleBackToPlayerSelection}
                        className="ocean-button flex items-center gap-1 text-sm"
                      >
                        <ArrowLeft className="w-3 h-3" />
                        Back to Guest Selection
                      </button>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
                      <div className="yacht-container p-3 flex items-center gap-3">
                        <div className="w-12 h-12 bg-[#1f5d88]/80 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-[#e0a955]" />
                        </div>
                        <div>
                          <div className="text-xs text-[#e0a955] uppercase tracking-wider mb-1">Selected Guest</div>
                          <div className="text-white font-medium text-lg">{selectedPlayer}</div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <div className="w-8 h-1 sm:w-1 sm:h-8 bg-[#1f5d88]/50"></div>
                        <div className="w-8 h-1 sm:w-1 sm:h-8 bg-[#e0a955]/50"></div>
                      </div>
                      <div className="yacht-container p-3 flex items-center gap-3">
                        <div className="w-12 h-12 bg-[#e0a955]/20 rounded-full flex items-center justify-center">
                          <Calculator className="w-6 h-6 text-[#e0a955]" />
                        </div>
                        <div>
                          <div className="text-xs text-[#e0a955] uppercase tracking-wider mb-1">Action Required</div>
                          <div className="text-white font-medium text-lg">Enter Net Worth</div>
                        </div>
                      </div>
                    </div>
                    <BalanceInput 
                      gameAddress={selectedGame}
                      playerName={selectedPlayer}
                      onBalanceSubmitted={handleBalanceSubmitted}
                    />
                  </div>
                ) : (
                  <div>
                    {playerHistory.length > 0 && (
                      <div className="mb-8">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-full bg-[#1f5d88]/80 flex items-center justify-center">
                            <User className="w-5 h-5 text-[#e0a955]" />
                          </div>
                          <h3 className="text-white text-xl font-semibold">Your Yacht Guests</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                          {playerHistory.map(player => (
                            <button
                              key={player}
                              onClick={() => setSelectedPlayer(player)}
                              className="yacht-container hover:border-[#e0a955]/50 p-3 transition-all hover:shadow-2xl flex items-center gap-3 group"
                            >
                              <div className="w-10 h-10 rounded-full bg-[#1f5d88]/30 group-hover:bg-[#1f5d88]/50 transition-colors flex items-center justify-center">
                                <User className="w-5 h-5 text-[#e0a955] group-hover:scale-110 transition-transform" />
                              </div>
                              <span className="text-white font-medium">{player}</span>
                            </button>
                          ))}
                        </div>
                        
                        <div className="border-t border-[#1f5d88]/30 pt-6">
                          <div className="flex items-center gap-3 mb-4 pl-2">
                            <UserPlus className="w-5 h-5 text-[#e0a955]" />
                            <p className="text-white/80 font-medium">Invite another millionaire to the yacht:</p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <PlayerSelector 
                      gameAddress={selectedGame}
                      onPlayerSelected={handlePlayerSelected}
                    />
                    
                    {/* Game state actions component showing Compare and Output buttons */}
                    <GameStateActions 
                      gameAddress={selectedGame}
                      showActionButtons={true}
                    />
                  </div>
                )}
              </div>
            ) : (
              <GameSelector onSelectGame={handleSelectGame} />
            )}
          </div>
        ) : (
          <div className="yacht-container mt-8 relative overflow-hidden">
            <div className="absolute inset-0 opacity-5 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMxZjVkODgiIGZpbGwtb3BhY2l0eT0iMC4xNSI+PHBhdGggZD0iTTM2IDM0di00aC0ydjRoLTR2Mmg0djRoMnYtNGg0di0yaC00em0wLTMwVjBoLTJ2NGgtNHYyaDR2NGgyVjZoNFY0aC00ek02IDM0di00SDR2NEgwdjJoNHY0aDJ2LTRoNHYtMkg2ek02IDRWMEg0djRIMHYyaDR2NGgyVjZoNFY0SDZ6Ii8+PC9nPjwvZz48L3N2Zz4=')]"></div>
            <div className="absolute bottom-0 left-0 right-0 h-72 bg-gradient-to-t from-[#1f5d88]/10 to-transparent"></div>
            <div className="absolute top-16 left-0 w-full">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320" className="opacity-10 text-[#1f5d88]">
                <path fill="currentColor" fillOpacity="1" d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,218.7C672,235,768,245,864,229.3C960,213,1056,171,1152,138.7C1248,107,1344,85,1392,74.7L1440,64L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
              </svg>
            </div>
            <div className="absolute bottom-0 left-0 w-full">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320" className="opacity-10 text-[#e0a955]">
                <path fill="currentColor" fillOpacity="1" d="M0,32L48,53.3C96,75,192,117,288,133.3C384,149,480,139,576,122.7C672,107,768,85,864,85.3C960,85,1056,107,1152,117.3C1248,128,1344,128,1392,128L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
              </svg>
            </div>
            <div className="p-12 text-center relative z-20 bg-gradient-to-b from-[#0e1e32]/90 to-[#0a121e]/95">
              <div className="w-28 h-28 bg-gradient-to-br from-[#0e1e32]/90 to-[#0a121e]/90 rounded-full mx-auto flex items-center justify-center mb-8 border-[3px] border-[#e0a955] relative shadow-[0_0_15px_rgba(224,169,85,0.3)]">
                <div className="absolute w-full h-full rounded-full border border-[#e0a955]/20 animate-ping opacity-70"></div>
                <Calculator className="w-14 h-14 text-[#e0a955]" />
              </div>
              
              <h2 className="text-5xl font-bold bg-gradient-to-r from-[#e0a955] via-[#f0cb7a] to-[#e0a955] inline-block text-transparent bg-clip-text mb-3">Millionaire's Dilemma</h2>
              <p className="text-white text-xl font-light italic mb-8">Yacht Edition</p>
              
              <div className="w-40 h-[2px] bg-gradient-to-r from-transparent via-[#e0a955]/40 to-transparent mx-auto mb-10"></div>
              
              <p className="text-white/90 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
                Connect your crypto wallet to experience the <span className="text-[#e0a955]">ultimate luxury yacht challenge</span> where millionaires compete for financial supremacy on the high seas.
              </p>
              
              <div className="relative inline-block mx-auto">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#e0a955] via-[#f5d493] to-[#e0a955] rounded-lg blur-md opacity-70 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
                <button
                  onClick={handleConnect}
                  className="luxury-button relative group overflow-hidden px-8 py-3"
                >
                  <span className="absolute inset-0 w-full h-full bg-white/10 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></span>
                  <Wallet className="w-5 h-5 relative z-10" />
                  <span className="relative z-10">Board the Yacht</span>
                </button>
              </div>
              
              <div className="flex flex-wrap items-center justify-center gap-2 mt-10 text-[#e0a955]/70">
                <div className="w-2 h-2 rounded-full bg-[#e0a955]/40"></div>
                <p className="text-sm">Secure crypto transactions</p>
                <div className="w-2 h-2 rounded-full bg-[#e0a955]/40"></div>
                <p className="text-sm">Encrypted balances</p>
                <div className="w-2 h-2 rounded-full bg-[#e0a955]/40"></div>
                <p className="text-sm">Exclusive access</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
