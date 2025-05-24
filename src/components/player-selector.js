"use client";

/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { User, CheckCircle, XCircle, Loader2, AlertCircle } from "lucide-react";
import { MAX_BALANCE_CALCULATOR_ABI } from "@/utils/contract";
import "@/styles/PlayerSelector.css";
import "@/styles/TransactionStyles.css";

// Add a helper utility for delaying UI updates during blockchain confirmations
const transactionDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const PlayerSelector = ({ gameAddress, onPlayerSelected }) => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  const [players, setPlayers] = useState([
    { name: "Alice", selected: false, address: null, loading: false },
    { name: "Bob", selected: false, address: null, loading: false },
    { name: "Eve", selected: false, address: null, loading: false },
  ]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Retry counter for contract accessibility
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 5;
  
  // Add transaction animation states
  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionMessage, setTransactionMessage] = useState("");
  const [transactionProgress, setTransactionProgress] = useState(0);
  
  // Check which players have been selected already
  const checkPlayersStatus = async () => {
    setIsLoading(true);
    setError("");
    
    try {
      console.log("Checking player status for game:", gameAddress);
      
      // Exit early if no game address is provided
      if (!gameAddress) {
        console.error("No game address provided");
        setError("No game selected. Please select a game first.");
        setIsLoading(false);
        return;
      }
      
      // Create a copy of the players state to update
      const updatedPlayers = [...players];
      
      // Check each player's status by calling the getBy function
      let anyPlayerAccessible = false;
      
      // Track if the current user has already selected a player
      let currentUserHasSelectedPlayer = false;
      let currentUserSelectedPlayerName = null;
      
      for (let i = 0; i < updatedPlayers.length; i++) {
        const player = updatedPlayers[i];
        try {
          console.log(`Checking status for player ${player.name} at game ${gameAddress}`);
          const playerAddress = await publicClient.readContract({
            address: gameAddress,
            abi: MAX_BALANCE_CALCULATOR_ABI,
            functionName: "getBy",
            args: [player.name],
          });
          
          console.log(`Player ${player.name} address:`, playerAddress);
          anyPlayerAccessible = true;
          
          // If the address is not the zero address (0x0000...0000), the player is already selected
          const isSelected = playerAddress !== "0x0000000000000000000000000000000000000000";
          
          // Check if current user has selected this player
          const selectedByCurrentUser = isSelected && playerAddress.toLowerCase() === address?.toLowerCase();
          
          // If this player is selected by the current user, track it
          if (selectedByCurrentUser) {
            currentUserHasSelectedPlayer = true;
            currentUserSelectedPlayerName = player.name;
          }
          
          updatedPlayers[i] = {
            ...player,
            selected: isSelected,
            address: isSelected ? playerAddress : null,
            selectedByCurrentUser: selectedByCurrentUser
          };
        } catch (playerError) {
          console.warn(`Error checking status for player ${player.name}:`, playerError);
          // Continue with other players if one fails
        }
      }
      
      // If current user has already selected a player, mark other players as locked
      if (currentUserHasSelectedPlayer) {
        updatedPlayers.forEach((player, index) => {
          if (!player.selectedByCurrentUser) {
            updatedPlayers[index] = {
              ...player,
              locked: true
            };
          }
        });
        
        // Set a message to inform the user
        setSuccess(`You have selected ${currentUserSelectedPlayerName}. You can't select other players.`);
      }
      
      // Reset retry count if we successfully accessed any player
      if (anyPlayerAccessible) {
        setRetryCount(0);
      }
      
      // If we couldn't access any player info, we'll try a few times before showing an error
      if (!anyPlayerAccessible) {
        if (retryCount < MAX_RETRIES) {
          console.log(`Contract not accessible yet, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
          setRetryCount(prev => prev + 1);
          // Set a temporary message that we're waiting for the contract
          setError(`Waiting for game contract to become accessible... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
          
          // Wait 3 seconds and try again
          setTimeout(() => {
            checkPlayersStatus();
          }, 3000);
          return;
        } else {
          console.error("Could not access any player information from the contract after multiple attempts");
          setError("Could not access the game contract after several attempts. The contract may not be fully deployed yet. Please try again later or select another game.");
        }
      } else {
        setPlayers(updatedPlayers);
      }
    } catch (error) {
      console.error("Error checking players status:", error);
      setError("Failed to load player information. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle player selection
  const selectPlayer = async (playerName) => {
    if (!address) {
      setError("Wallet not connected. Please connect your wallet.");
      return;
    }
    
    // Prevent new selection during pending transaction
    if (transactionPending) {
      setError("A transaction is already in progress. Please wait for it to complete.");
      return;
    }
    
    // Find the player
    const playerIndex = players.findIndex(player => player.name === playerName);
    if (playerIndex === -1 || players[playerIndex].selected) {
      setError(`Player ${playerName} is not available.`);
      return;
    }
    
    // Check if this user has already selected another player
    const alreadySelectedPlayer = players.find(player => player.selectedByCurrentUser);
    if (alreadySelectedPlayer) {
      setError(`You've already selected ${alreadySelectedPlayer.name}. You can only select one player.`);
      return;
    }

    // Check if player is locked (because user already selected another player)
    if (players[playerIndex].locked) {
      setError(`You can't select ${playerName} because you've already selected another player.`);
      return;
    }
    
    setError("");
    
    // Start animation for selection
    setTransactionPending(true);
    setTransactionMessage(`Selecting player ${playerName}...`);
    setTransactionProgress(0);
    
    // Progress animation
    const progressInterval = setInterval(() => {
      setTransactionProgress(prev => Math.min(prev + 5, 100));
    }, 100);
    
    try {
      // Add artificial delay for better UX and to prevent race conditions
      await transactionDelay(1000);
      
      clearInterval(progressInterval);
      setTransactionProgress(100);
      setTransactionMessage(`Player ${playerName} selected!`);
      
      // Wait a moment before showing success message
      await transactionDelay(500);
      
      setSuccess(`Selected player ${playerName}. Proceed to enter your balance.`);
      setTransactionPending(false);
      
      // Notify parent component to show the balance input form
      if (onPlayerSelected) {
        onPlayerSelected(playerName);
      }
    } catch (error) {
      clearInterval(progressInterval);
      setError(`Error selecting player: ${error.message}`);
      setTransactionPending(false);
    }
  };

  // Load player statuses when component mounts or gameAddress changes
  useEffect(() => {
    if (gameAddress && publicClient && address) {
      console.log("PlayerSelector: Loading player statuses for game:", gameAddress);
      checkPlayersStatus();
    }
  }, [gameAddress, publicClient, address]);

  return (
    <div className="player-selector bg-gray-800 border border-gray-700 rounded-xl p-6">
      <h2 className="text-white text-xl font-medium mb-6 text-center">Select Your Player</h2>
      
      {error && (
        <div className="error-message bg-red-500/10 border border-red-500/30 text-red-500 p-3 mb-6 rounded-md text-sm">
          <div className="flex items-center">
            <AlertCircle className="w-4 h-4 mr-2" />
            {error}
          </div>
        </div>
      )}
      
      {success && (
        <div className="success-message bg-green-500/10 border border-green-500/30 text-green-500 p-3 mb-6 rounded-md text-sm">
          <div className="flex items-center">
            <CheckCircle className="w-4 h-4 mr-2" />
            {success}
          </div>
        </div>
      )}
      
      {transactionPending && (
        <div className="mb-6 animate-fade-in">
          <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-md transaction-progress-container transaction-pulse">
            <div className="flex items-center mb-2">
              <Loader2 className="animate-spin w-5 h-5 mr-2 text-blue-400" />
              <span className="text-blue-400 font-medium">{transactionMessage}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5">
              <div 
                className="bg-blue-500 h-2.5 rounded-full transaction-progress-bar"
                style={{ width: `${transactionProgress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}
      
      {isLoading ? (
        <div className="flex justify-center items-center p-10">
          <Loader2 className="animate-spin text-blue-400 w-8 h-8" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {players.map((player) => (
            <div
              key={player.name}
              className={`player-card border rounded-lg p-6 flex flex-col items-center transition-all ${
                player.selectedByCurrentUser
                  ? "bg-[#1f5d88]/20 border-[#e0a955]/50 shadow-lg"
                  : player.selected
                    ? "bg-[#1f5d88]/10 border-[#1f5d88]/30"
                    : player.locked
                      ? "bg-gray-800/60 border-gray-700/30 opacity-50"
                      : "bg-[#0e1e32]/60 border-[#1f5d88]/30 hover:border-[#e0a955]/30 cursor-pointer"
              }`}
              onClick={() => !player.selected && !player.locked && selectPlayer(player.name)}
              style={{ cursor: player.locked ? 'not-allowed' : player.selected ? 'default' : 'pointer' }}
            >
              <div className={`h-16 w-16 rounded-full flex items-center justify-center mb-4 ${
                player.selectedByCurrentUser 
                  ? "bg-[#1f5d88]/50 border-2 border-[#e0a955]" 
                  : player.selected
                    ? "bg-[#1f5d88]/30 border-[#1f5d88]/50" 
                    : player.locked
                      ? "bg-gray-700/40"
                      : "bg-[#1f5d88]/20"
              }`}>
                <User className={`h-8 w-8 ${
                  player.selectedByCurrentUser 
                    ? "text-[#e0a955]" 
                    : player.selected 
                      ? "text-blue-300/70" 
                      : player.locked 
                        ? "text-gray-400" 
                        : "text-white/70"
                }`} />
              </div>
              <h3 className={`text-xl font-semibold ${
                player.selectedByCurrentUser 
                  ? "text-[#e0a955]" 
                  : player.selected 
                    ? "text-blue-300" 
                    : player.locked 
                      ? "text-gray-400" 
                      : "text-white"
              }`}>{player.name}</h3>
              
              <div className="mt-5 flex items-center">
                {player.loading ? (
                  <div className="flex items-center gap-2 bg-[#1f5d88]/20 px-3 py-1.5 rounded-full">
                    <Loader2 className="animate-spin text-[#e0a955] w-4 h-4" />
                    <span className="text-sm text-white/80">Processing...</span>
                  </div>
                ) : player.locked ? (
                  <div className="flex items-center gap-2 bg-gray-700/40 px-3 py-1.5 rounded-full">
                    <XCircle className="text-gray-400 w-4 h-4" />
                    <span className="text-sm text-gray-400">
                      Locked
                    </span>
                  </div>
                ) : player.selectedByCurrentUser ? (
                  <div className="flex items-center gap-2 bg-[#1f5d88]/30 px-3 py-1.5 rounded-full border border-[#1f5d88]/50">
                    <CheckCircle className="text-[#e0a955] w-4 h-4" />
                    <span className="text-sm text-white/90 font-medium">
                      Your Selection
                    </span>
                  </div>
                ) : player.selected ? (
                  <div className="flex items-center gap-2 bg-[#1f5d88]/20 px-3 py-1.5 rounded-full border border-[#1f5d88]/40">
                    <CheckCircle className="text-blue-300 w-4 h-4" />
                    <span className="text-sm text-white/70">
                      Already Selected
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-[#0e1e32]/80 px-3 py-1.5 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#e0a955]/70">
                      <path d="M19 12a7 7 0 1 1-7-7"/>
                      <path d="M12 8V5m4.3 7H19"/>
                    </svg>
                    <span className="text-sm text-white/70">Available</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div className="mt-8 text-center">
        <div className="w-16 h-1 bg-gradient-to-r from-[#1f5d88]/50 to-[#e0a955]/50 mx-auto mb-5 rounded-full"></div>
        <p className="text-[#e0a955] font-medium text-lg">
          Select a millionaire to join your yacht
        </p>
        <p className="text-sm text-white/60 mt-2">
          You can select only one guest for the dilemma
        </p>
      </div>
    </div>
  );
};

export default PlayerSelector;
