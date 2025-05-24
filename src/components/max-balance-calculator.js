"use client";

/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from "react";
import { useAccount, usePublicClient, useWalletClient, useWriteContract } from "wagmi";
import { parseEther } from "viem";
import { Calculator, ArrowRight, Lock, RefreshCw, User, Award, Coins, CheckCircle2 } from "lucide-react";
import { encryptValue, reEncryptValue } from "@/utils/inco-lite";
import {
  MAX_BALANCE_CALCULATOR_ABI,
} from "@/utils/contract";

// Define the players
const PLAYERS = [
  {
    id: "alice",
    name: "Alice",
    color: "bg-pink-500",
    image: "👩‍💻",
    description: "Tech enthusiast with secret savings"
  },
  {
    id: "bob",
    name: "Bob",
    color: "bg-blue-500",
    image: "👨‍💼",
    description: "Business owner with hidden assets"
  },
  {
    id: "eve",
    name: "Eve",
    color: "bg-purple-500",
    image: "👩‍🔬",
    description: "Scientist with mysterious wealth"
  }
];

// Utility function to handle transaction confirmation with retries
const waitForTransactionWithRetry = async (publicClient, hash, maxRetries = 3, timeout = 60_000) => {
  let retries = 0;
  let lastError;
  
  while (retries < maxRetries) {
    try {
      console.log(`Waiting for transaction confirmation, attempt ${retries + 1}/${maxRetries}`);
      
      const transaction = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout,
      });
      
      return transaction;
    } catch (error) {
      console.error(`Transaction confirmation attempt ${retries + 1} failed:`, error);
      lastError = error;
      retries++;
      
      // Don't wait after the last retry
      if (retries < maxRetries) {
        // Exponential backoff
        const delay = 2000 * Math.pow(2, retries - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`Transaction confirmation failed after ${maxRetries} attempts: ${lastError?.message || "unknown error"}`);
};

const MaxBalanceCalculator = ({ contractAddress }) => {
  const { address } = useAccount();
  const [gameState, setGameState] = useState("select-player"); // "select-player", "enter-balance", "waiting-for-others", "ready-to-compare", "result"
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [balance, setBalance] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isCheckingResult, setIsCheckingResult] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [takenPlayers, setTakenPlayers] = useState([]);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [currentState, setCurrentState] = useState(0);
  const [output, setOutput] = useState("");
  const [txStatus, setTxStatus] = useState("idle"); // "idle", "pending", "confirming", "confirmed"
  const [lastKnownContractAddress, setLastKnownContractAddress] = useState("");
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const pollingIntervalRef = useRef(null);
  const blockSubscriptionRef = useRef(null);

  // Initial component setup - verify contract and set last known address
  useEffect(() => {
    if (contractAddress) {
      // Set the initial contract address to track changes
      setLastKnownContractAddress(contractAddress);
      
      // Force a reset of the component state on first load
      resetGameState();
    }
    
    // If we're connected, fetch initial state
    if (address && publicClient) {
      fetchState();
    }
  }, []); // Empty dependency array means this runs once on mount

  // Reset state when the contract address changes
  useEffect(() => {
    const currentAddress = MAX_BALANCE_CALCULATOR_ADDRESS;
    
    // If this is the first time or if the contract address has changed
    if (lastKnownContractAddress && lastKnownContractAddress !== currentAddress) {
      console.log("Contract address changed, resetting game state");
      // Reset game state
      setGameState("select-player");
      setSelectedPlayer(null);
      setBalance("");
      setParticipantCount(0);
      setTakenPlayers([]);
      setError("");
      setSuccessMessage("");
      setCurrentState(0);
      setOutput("");
      setTxStatus("idle");
    }
    
    // Update last known contract address
    setLastKnownContractAddress(currentAddress);
  }, [MAX_BALANCE_CALCULATOR_ADDRESS, lastKnownContractAddress]);

  // Clean up function to clear all intervals and subscriptions
  useEffect(() => {
    return () => {
      // Clear any polling intervals
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      
      // Unsubscribe from block watcher
      if (blockSubscriptionRef.current) {
        blockSubscriptionRef.current.unsubscribe?.();
      }
    };
  }, []);
  
  // Reset and refetch when wallet address changes
  const addressRef = useRef(address);
  useEffect(() => {
    // Only run this effect if the address actually changed (not on initial mount)
    if (addressRef.current !== address) {
      console.log("Wallet address changed, resetting game state");
      resetGameState();
      
      // Update the ref
      addressRef.current = address;
      
      // If we have a valid new address, fetch the state
      if (address && publicClient) {
        fetchState();
      }
    }
  }, [address]);

  // Fetch contract state when component mounts or address changes
  useEffect(() => {
    if (address && publicClient) {
      fetchState();
    }
  }, [address, publicClient]);

  // Set up polling for contract state updates
  useEffect(() => {
    if (address && publicClient) {
      // Initial fetch
      fetchState();
      
      // Set up polling interval - poll more frequently during active states
      const pollingInterval = gameState === "waiting-for-others" || gameState === "ready-to-compare" ? 5000 : 10000;
      
      // Clear any existing interval before setting a new one
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      
      pollingIntervalRef.current = setInterval(() => {
        // Only auto-refresh if we're not in the middle of another operation
        if (!isLoading && !isCalculating && !isCheckingResult) {
          fetchState().catch(err => console.error("Error in polling:", err));
        }
      }, pollingInterval);
    }
    
    // Clean up interval on unmount or when dependencies change
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [address, publicClient, gameState, isLoading, isCalculating, isCheckingResult]);

  // Update UI reactively when takenPlayers changes
  useEffect(() => {
    // If the currently selected player has already submitted a balance, go to waiting state
    if (selectedPlayer && takenPlayers.includes(selectedPlayer.name)) {
      setGameState("waiting-for-others");
    }
    
    // Update participant count based on taken players length
    setParticipantCount(takenPlayers.length);
  }, [takenPlayers, selectedPlayer]);
  
  // Monitor transactions to detect changes in contract state
  useEffect(() => {
    // Unsubscribe from any existing subscription first
    if (blockSubscriptionRef.current) {
      blockSubscriptionRef.current.unsubscribe?.();
      blockSubscriptionRef.current = null;
    }
    
    // Set up new subscription if client is available
    if (publicClient) {
      try {
        blockSubscriptionRef.current = publicClient.watchBlocks({
          onBlock: async (blockNumber) => {
            console.log("New block detected:", blockNumber);
            // A new block was mined, check if our contract state has changed
            // Only check if we're not already loading something
            if (!isLoading && !isCalculating && !isCheckingResult) {
              try {
                await fetchState();
              } catch (error) {
                console.error("Error fetching state after new block:", error);
              }
            }
          }
        });
      } catch (error) {
        console.error("Error setting up block watcher:", error);
      }
    }
    
    // Clean up subscription on unmount or when dependencies change
    return () => {
      if (blockSubscriptionRef.current) {
        try {
          blockSubscriptionRef.current.unsubscribe?.();
          blockSubscriptionRef.current = null;
        } catch (error) {
          console.error("Error unsubscribing from block watcher:", error);
        }
      }
    };
  }, [publicClient, isLoading, isCalculating, isCheckingResult]);

  // Get current state of the contract with improved error handling and state management
  const fetchState = async () => {
    try {
      // Check if wallet is connected
      if (!address) {
        // Reset state if wallet is disconnected
        resetGameState();
        return null;
      }
      
      // Show a small indicator that state is refreshing
      const prevSuccessMessage = successMessage;
      if (!isLoading && !isCalculating && !isCheckingResult) {
        setSuccessMessage(prevSuccessMessage ? `${prevSuccessMessage} (Refreshing...)` : "Refreshing state...");
      }
      
      // Get contract state
      const state = await publicClient.readContract({
        address: MAX_BALANCE_CALCULATOR_ADDRESS,
        abi: MAX_BALANCE_CALCULATOR_ABI,
        functionName: "currentState",
      });
      
      setCurrentState(state);
      console.log("Current contract state:", state);

      // Update participant count based on state
      // State 1 (ENTERED) means all 3 have submitted
      // State 2 (COMPARED) means all 3 have submitted and comparison done
      if (state >= 1) {
        setParticipantCount(3);
      }
      
      // Check which players have already submitted balances
      const taken = [];
      let currentParticipantCount = 0;
      
      // Use Promise.all to make parallel requests for checking player balances
      await Promise.all(PLAYERS.map(async (player) => {
        try {
          // If this call doesn't throw an error, the player has a balance
          await publicClient.readContract({
            address: MAX_BALANCE_CALCULATOR_ADDRESS,
            abi: MAX_BALANCE_CALCULATOR_ABI,
            functionName: "getBalance",
            args: [player.name],
          });
          
          // If we get here, the player has submitted a balance
          taken.push(player.name);
          currentParticipantCount++;
        } catch (error) {
          // If there's an error, the player hasn't submitted a balance yet
          console.log(`${player.name} has not submitted a balance yet`);
        }
      }));
      
      setTakenPlayers(taken);
      setParticipantCount(currentParticipantCount);
      console.log("Taken players:", taken, "Count:", currentParticipantCount);
      
      // Update game state based on contract state and participation
      if (state === 0) {
        // Initial state
        if (selectedPlayer && !taken.includes(selectedPlayer.name)) {
          setGameState("enter-balance");
        } else if (selectedPlayer && taken.includes(selectedPlayer.name)) {
          setGameState("waiting-for-others");
        } else if (currentParticipantCount < 3) {
          setGameState("select-player");
        } else {
          setGameState("waiting-for-others");
        }
      } else if (state === 1) {
        // All players have entered balances
        setGameState("ready-to-compare");
      } else if (state === 2) {
        // Comparison complete, show results
        setGameState("result");
        
        // If comparison is complete, fetch the output
        try {
          const result = await publicClient.readContract({
            address: MAX_BALANCE_CALCULATOR_ADDRESS,
            abi: MAX_BALANCE_CALCULATOR_ABI,
            functionName: "output",
          });
          
          if (result) {
            setOutput(result);
            console.log("Output from contract:", result);
          }
        } catch (outputError) {
          console.error("Error fetching output:", outputError);
          // Don't update output if there was an error
        }
      }
      
      // Restore previous success message if we were just refreshing
      if (!isLoading && !isCalculating && !isCheckingResult && successMessage === `${prevSuccessMessage} (Refreshing...)`) {
        setSuccessMessage(prevSuccessMessage);
      } else if (successMessage === "Refreshing state...") {
        setSuccessMessage("");
      }
      
      return state;
    } catch (error) {
      console.error("Error fetching state:", error);
      
      // Check if error is related to invalid contract or contract not existing
      if (error.message.includes("Contract address") || 
          error.message.includes("does not exist") ||
          error.message.includes("invalid address") || 
          error.message.includes("Contract not deployed")) {
        setError(`Contract at ${MAX_BALANCE_CALCULATOR_ADDRESS} is not valid or not deployed. Please check the address.`);
        resetGameState();
      } else {
        setError("Failed to refresh contract state. Please try again.");
      }
      return null;
    }
  };

  // Helper function to reset all game state
  const resetGameState = () => {
    console.log("Resetting game state to initial values");
    setGameState("select-player");
    setSelectedPlayer(null);
    setBalance("");
    setParticipantCount(0);
    setTakenPlayers([]);
    setError("");
    setSuccessMessage("");
    setCurrentState(0);
    setOutput("");
    setTxStatus("idle");
    setIsLoading(false);
    setIsCalculating(false);
    setIsCheckingResult(false);
  };

  const submitBalance = async () => {
    if (!balance || Number(balance) <= 0) {
      setError("Please enter a valid balance");
      return;
    }

    if (!selectedPlayer) {
      setError("Please select a player first");
      return;
    }

    setError("");
    setSuccessMessage("");
    setIsLoading(true);
    setTxStatus("pending");

    try {
      // First check the current state
      const state = await fetchState();
      if (state !== 0) {
        setError("Cannot submit balance in the current contract state");
        setIsLoading(false);
        return;
      }
      
      // Parse the balance to Wei format
      const parsedBalance = parseEther(balance);
      
      // Show status message during encryption
      setSuccessMessage(`Encrypting ${selectedPlayer.name}&apos;s balance...`);
      setTxStatus("idle");
      
      // Encrypt the value
      const encryptedData = await encryptValue({
        value: parsedBalance,
        address: address,
        contractAddress: MAX_BALANCE_CALCULATOR_ADDRESS,
      });

      console.log("Encrypted balance:", encryptedData);
      
      // Update status message for transaction submission
      setSuccessMessage(`Submitting ${selectedPlayer.name}&apos;s encrypted balance to the blockchain...`);

      // Submit the encrypted balance to the smart contract using enterBalance
      const hash = await writeContractAsync({
        address: MAX_BALANCE_CALCULATOR_ADDRESS,
        abi: MAX_BALANCE_CALCULATOR_ABI,
        functionName: "enterBalance",
        args: [encryptedData, selectedPlayer.name],
      });
      
      // Show transaction pending status
      setTxStatus("pending");
      setSuccessMessage(`Transaction submitted! Waiting for blockchain confirmation...`);
      
      try {
        // Use the waitForTransactionWithRetry utility for better handling of blockchain confirmations
        const transaction = await waitForTransactionWithRetry(
          publicClient,
          hash,
          3,  // Max 3 retries
          60_000  // 60 seconds timeout per attempt
        );

        if (transaction.status !== "success") {
          throw new Error("Transaction failed on the blockchain");
        }

        console.log("Balance submitted successfully:", transaction);
        setSuccessMessage(`${selectedPlayer.name}&apos;s balance has been securely submitted!`);
        setBalance("");
        setTxStatus("confirmed");
        
        // Update state and check latest contract state
        await fetchState();
        
        // Only change game state after confirming transaction was successful
        setGameState("waiting-for-others");
      } catch (confirmError) {
        console.error("Transaction confirmation error:", confirmError);
        
        // Transaction might still be pending, inform the user
        setError(`Transaction may still be pending. Please check status and refresh in a moment.`);
        
        // Try to fetch state again to see current status
        await fetchState();
      }
    } catch (error) {
      console.error("Transaction failed:", error);
      
      // If the error is because the player is already taken
      if (error.message.includes("AlreadyEntered")) {
        setError(`${selectedPlayer.name} already has a balance submitted. Please choose another player.`);
        setGameState("select-player");
        
        // Update taken players list
        await fetchState();
      } else {
        setError(error.message || "Failed to submit balance");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const calculateMaximum = async () => {
    setError("");
    setSuccessMessage("");
    setIsCalculating(true);
    setTxStatus("idle");

    try {
      // First check the current state
      const state = await fetchState();
      if (state !== 1) {
        setError("Cannot compare balances in the current contract state");
        setIsCalculating(false);
        return;
      }

      // Update status for user feedback
      setSuccessMessage("Initiating maximum balance comparison...");

      // Call the compare function on the smart contract
      const hash = await writeContractAsync({
        address: MAX_BALANCE_CALCULATOR_ADDRESS,
        abi: MAX_BALANCE_CALCULATOR_ABI,
        functionName: "compare",
        args: [],
      });
      
      // Update status for waiting for confirmation
      setTxStatus("pending");
      setSuccessMessage("Comparison transaction submitted! Waiting for blockchain confirmation...");
      
      try {
        // Update transaction status to confirming
        setTxStatus("confirming");
        
        // Use the waitForTransactionWithRetry utility for better handling of blockchain confirmations
        const transaction = await waitForTransactionWithRetry(
          publicClient,
          hash,
          3,  // Max 3 retries
          90_000  // 90 seconds timeout per attempt (this operation may take longer)
        );

        if (transaction.status !== "success") {
          throw new Error("Transaction failed on the blockchain");
        }

        // Transaction confirmed successfully
        setTxStatus("confirmed");
        console.log("Maximum calculation successful:", transaction);
        
        // After confirmation, update state and fetch results
        await fetchState();
        
        // Then update UI to show success and set game state to result
        setSuccessMessage("Maximum calculated successfully! Check the result below.");
        setGameState("result");
        
        // Try to fetch result automatically after transaction is confirmed
        try {
          const result = await publicClient.readContract({
            address: MAX_BALANCE_CALCULATOR_ADDRESS,
            abi: MAX_BALANCE_CALCULATOR_ABI,
            functionName: "output",
          });
          
          if (result) {
            setOutput(result);
          }
        } catch (outputError) {
          console.error("Could not automatically fetch result:", outputError);
          // This is not critical, as user can manually check the result
        }
      } catch (confirmError) {
        console.error("Transaction confirmation error:", confirmError);
        setError(`Transaction may still be processing. Please wait and check result in a moment.`);
        
        // Try to fetch state again to see current status
        await fetchState();
      }
    } catch (error) {
      console.error("Calculation failed:", error);
      setError(error.message || "Failed to calculate maximum");
    } finally {
      setIsCalculating(false);
    }
  };
  
  const checkResult = async () => {
    setIsCheckingResult(true);
    setError("");
    setSuccessMessage("Retrieving result...");
    
    try {
      // First check the current state and refresh contract state
      await fetchState();
      
      if (currentState !== 2) {
        // If we're not in state 2 (COMPARED), the comparison operation might still be processing
        setError("Cannot check result - comparison not completed yet. Please wait for blockchain confirmation and try again.");
        setSuccessMessage("");
        return;
      }
      
      // Make multiple attempts to retrieve the result as it might take time for the contract state to update
      let result = null;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (!result && attempts < maxAttempts) {
        attempts++;
        
        try {
          // Call output to get the result message from the contract
          result = await publicClient.readContract({
            address: MAX_BALANCE_CALCULATOR_ADDRESS,
            abi: MAX_BALANCE_CALCULATOR_ABI,
            functionName: "output",
          });
          
          console.log(`Attempt ${attempts}: Result from output function:`, result);
          
          if (result) {
            break;
          } else {
            // Small delay between attempts
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (attemptError) {
          console.error(`Attempt ${attempts} failed:`, attemptError);
          // Continue to next attempt
        }
      }
      
      if (result) {
        setOutput(result);
        setSuccessMessage("Successfully retrieved the result!");
      } else {
        setError("No result found after multiple attempts. The blockchain transaction might still be processing.");
      }
    } catch (error) {
      console.error("Error checking result:", error);
      setError(error.message || "Failed to retrieve the result");
    } finally {
      setIsCheckingResult(false);
    }
  };

  // Transaction progress indicator component
  const TransactionProgress = ({ status }) => {
    const [dots, setDots] = useState(".");
    
    useEffect(() => {
      const interval = setInterval(() => {
        setDots(prev => prev.length >= 3 ? "." : prev + ".");
      }, 500);
      
      return () => clearInterval(interval);
    }, []);
    
    return (
      <div className="text-center mt-3">
        <p className="text-gray-300 text-sm mb-2">
          {status === 'idle' && `Preparing transaction${dots}`}
          {status === 'pending' && `Transaction submitted, waiting${dots}`}
          {status === 'confirming' && `Confirming on blockchain${dots}`}
          {status === 'confirmed' && 'Transaction successful!'}
        </p>
        <div className="w-full bg-gray-700 rounded-full h-1 mb-2">
          <div 
            className={`h-1 rounded-full ${status === 'confirmed' ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`}
            style={{ width: status === 'idle' ? '25%' : status === 'pending' ? '50%' : status === 'confirming' ? '75%' : '100%' }}
          ></div>
        </div>
      </div>
    );
  };

  // Helper function to render the appropriate screen based on game state
  const renderGameScreen = () => {
    switch (gameState) {
      case "select-player":
        return renderPlayerSelection();
      case "enter-balance":
        return renderBalanceEntry();
      case "waiting-for-others":
        return renderWaitingScreen();
      case "ready-to-compare":
        return renderCompareScreen();
      case "result":
        return renderResultScreen();
      default:
        return renderPlayerSelection();
    }
  };

  // Player selection screen
  const renderPlayerSelection = () => (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-white text-center mb-4">Select Your Player</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLAYERS.map(player => (
            <div 
              key={player.id} 
              className={`relative rounded-lg overflow-hidden border-2 transition-all transform ${
                selectedPlayer?.id === player.id 
                  ? `border-${player.color.replace('bg-', '')} ring-2 ring-${player.color.replace('bg-', '')}`
                  : `border-${player.color.replace('bg-', '')} cursor-pointer hover:scale-105`
              }`}
              onClick={() => setSelectedPlayer(player)}
            >
              <div className={`${player.color} p-6 text-center`}>
                <div className="text-5xl mb-2">{player.image}</div>
                <h3 className="text-xl font-bold text-white">{player.name}</h3>
                <p className="text-white/80 text-sm">{player.description}</p>
              </div>
              
              {selectedPlayer?.id === player.id && (
                <div className="absolute top-0 right-0 bg-green-500 text-white p-1 rounded-bl-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
        ))}
      </div>
      
      {selectedPlayer && (
        <button
          onClick={() => setGameState("enter-balance")}
          className="w-full p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
        >
          <div className="flex items-center">
            Continue as {selectedPlayer.name} <ArrowRight className="ml-2" />
          </div>
        </button>
      )}
    </div>
  );

  // Balance entry screen
  const renderBalanceEntry = () => (
    <div className="space-y-5">
      <div className="p-6 bg-gray-800 rounded-lg text-center">
        <div className="text-5xl mb-3">{selectedPlayer?.image || "🎭"}</div>
        <h3 className="text-xl font-bold text-white mb-2">
          Enter {selectedPlayer?.name}&apos;s Balance
        </h3>
        <p className="text-gray-300 mb-4">This value will be securely encrypted</p>
        
        <input
          type="number"
          placeholder="Enter Balance (e.g. 1000)"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          disabled={isLoading}
        />
        
        <div className="flex gap-3 mt-4">
          <button
            onClick={submitBalance}
            className="flex-1 p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!balance || Number(balance) <= 0 || isLoading}
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <div className="flex items-center">
                Submit Balance <ArrowRight className="ml-2" />
              </div>
            )}
          </button>
          
          <button
            onClick={() => setGameState("select-player")}
            className="p-3 bg-transparent border border-gray-600 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center"
            disabled={isLoading}
          >
            Back
          </button>
        </div>
        
        {isLoading && <TransactionProgress status={txStatus} />}
      </div>
    </div>
  );

  // Waiting for other players screen with auto-updating UI
  const renderWaitingScreen = () => (
    <div className="space-y-5 text-center">
      <div className="p-6 bg-gray-800 rounded-lg">
        <div className="text-5xl mb-3">{selectedPlayer?.image || "🎭"}</div>
        <h3 className="text-xl font-bold text-white mb-2">
          {selectedPlayer ? `${selectedPlayer.name}&apos;s Balance Submitted` : "Balance Submitted"}
        </h3>
        <p className="text-gray-300 mb-4">
          {participantCount === 3 
            ? "All players have submitted! Ready to compare balances."
            : "Waiting for other players to submit their balances..."}
        </p>
        
        <div className="flex justify-center items-center gap-4 mb-4">
          {PLAYERS.map(player => {
            const hasSubmitted = takenPlayers.includes(player.name);
            return (
              <div key={player.id} className={`flex flex-col items-center ${hasSubmitted ? "text-green-400" : "text-gray-500"}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasSubmitted ? player.color : "bg-gray-700"} transition-all duration-300`}>
                  {hasSubmitted ? "✓" : "?"}
                </div>
                <span className="text-xs mt-1">{player.name}</span>
                <span className="text-xs opacity-70">{hasSubmitted ? "Submitted" : "Waiting"}</span>
              </div>
            );
          })}
        </div>
        
        <div className={`border rounded-lg p-3 mb-4 transition-all duration-300 ${
          participantCount === 3 
            ? "bg-green-900/20 border-green-500 text-green-400" 
            : "bg-blue-900/20 border-blue-500 text-blue-400"
        }`}>
          <p className="flex items-center justify-center">
            <User className="mr-2" />
            {participantCount} of 3 players have submitted their balances
            {participantCount === 3 && " - Ready to proceed!"}
          </p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={fetchState}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center mx-auto"
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh Status
          </button>
          
          {participantCount === 3 && (
            <button
              onClick={() => setGameState("ready-to-compare")}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center mx-auto"
            >
              Continue to Comparison <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          )}
        </div>
        
        <div className="mt-4 text-xs text-gray-400">
          <p>Status updates automatically every 5 seconds</p>
          <div className="mt-1 w-full bg-gray-700 rounded-full h-1 overflow-hidden">
            <div className="bg-blue-500 h-1 animate-pulse" style={{ width: `${(participantCount/3) * 100}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );

  // Compare screen with improved transaction handling
  const renderCompareScreen = () => (
    <div className="space-y-5 text-center">
      <div className="p-6 bg-gray-800 rounded-lg">
        <div className="text-5xl mb-3">🔐</div>
        <h3 className="text-xl font-bold text-white mb-2">All Balances Submitted</h3>
        <p className="text-gray-300 mb-4">Ready to calculate the maximum balance</p>
        
        <div className="grid grid-cols-3 gap-4 mb-6">
          {PLAYERS.map(player => (
            <div key={player.id} className="text-center">
              <div className={`w-12 h-12 ${player.color} rounded-full mx-auto flex items-center justify-center text-xl`}>
                {player.image}
              </div>
              <p className="mt-1 text-white font-medium text-sm">{player.name}</p>
              <p className="text-gray-400 text-xs">Balance encrypted</p>
            </div>
          ))}
        </div>
        
        <div className="mb-4 bg-yellow-900/20 border border-yellow-500 text-yellow-400 p-3 rounded-lg text-sm">
          <p>This operation requires blockchain interaction and may take 15-30 seconds to complete.</p>
        </div>
        
        <button
          onClick={calculateMaximum}
          className="w-full p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isCalculating}
        >
          {isCalculating ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Processing on blockchain...
            </div>
          ) : (
            <div className="flex items-center">
              Calculate Maximum <Calculator className="ml-2" />
            </div>
          )}
        </button>
        
        {isCalculating && (
          <>
            <div className="mt-4 bg-gray-900/50 p-3 rounded-lg text-gray-300">
              <p className="text-sm">Please wait while the transaction is being processed...</p>
              <div className="mt-2 w-full bg-gray-700 rounded-full h-1 overflow-hidden">
                <div className="bg-green-500 h-1 animate-[pulse_1.5s_ease-in-out_infinite]" style={{ width: '100%' }}></div>
              </div>
            </div>
            <TransactionProgress status={txStatus} />
          </>
        )}
      </div>
    </div>
  );

  // Result screen with improved result handling
  const renderResultScreen = () => (
    <div className="space-y-5 text-center">
      <div className="p-6 bg-gray-800 rounded-lg">
        <div className="text-5xl mb-3">🏆</div>
        <h3 className="text-xl font-bold text-white mb-2">Result Ready</h3>
        
        {output ? (
          <div className="bg-green-900/20 border border-green-500 text-green-400 p-4 rounded-lg text-center mb-4 animate-[fadeIn_0.5s_ease-in-out]">
            <Award className="w-8 h-8 mx-auto mb-2" />
            <p className="text-lg font-bold">{output}</p>
            <p className="text-sm mt-2">Maximum balance calculated securely!</p>
            <div className="mt-4 mx-auto w-16 h-1 bg-green-500 rounded-full"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-blue-900/20 border border-blue-500 text-blue-400 p-4 rounded-lg text-sm mb-4">
              <p>The comparison has been completed on the blockchain.</p>
              <p>Click the button below to reveal the result.</p>
            </div>
            
            <button
              onClick={checkResult}
              className="w-full p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isCheckingResult}
            >
              {isCheckingResult ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Retrieving result...
                </div>
              ) : (
                <div className="flex items-center">
                  Reveal Result <Lock className="ml-2" />
                </div>
              )}
            </button>
          </div>
        )}
        
        <div className="grid grid-cols-3 gap-4 mb-4 mt-6">
          {PLAYERS.map(player => (
            <div key={player.id} className={`text-center ${output && output.includes(player.name) ? "ring-2 ring-yellow-400 rounded-lg p-2" : "p-2"}`}>
              <div className={`w-12 h-12 ${player.color} rounded-full mx-auto flex items-center justify-center text-xl
                ${output && output.includes(player.name) ? "animate-[pulse_2s_infinite]" : "opacity-70"}`}>
                {player.image}
              </div>
              <p className={`mt-1 font-medium text-sm ${output && output.includes(player.name) ? "text-yellow-400" : "text-white"}`}>
                {player.name}
                {output && output.includes(player.name) && <span className="ml-1">👑</span>}
              </p>
            </div>
          ))}
        </div>
        
        <div className="mt-6 border-t border-gray-700 pt-4">
          <p className="text-gray-400 text-sm flex items-center justify-center">
            <Lock className="h-4 w-4 mr-1" /> 
            Privacy preserved! Individual balances remain confidential.
          </p>
        </div>
      </div>
      
      <div className="flex gap-4">
        <button
          onClick={fetchState}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center flex-1 justify-center"
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh Result
        </button>
        
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center flex-1 justify-center"
        >
          <Coins className="mr-2 h-4 w-4" /> Start New Game
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex items-center justify-center w-full">
      <div className="w-full max-w-4xl bg-gray-700/40 rounded-xl shadow-2xl border border-gray-700 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white flex items-center">
              <Calculator className="mr-3 text-blue-400" />
              Secret Max Balance Game
            </h2>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  resetGameState();
                  fetchState();
                }}
                className="text-gray-400 hover:text-white transition-colors p-1"
                title="Reset and refresh state"
              >
                <RefreshCw size={16} />
              </button>
              <div className="text-gray-300 text-sm bg-gray-800 px-3 py-1 rounded-md">
                Players: {participantCount}/3
              </div>
            </div>
          </div>
          
          {MAX_BALANCE_CALCULATOR_ADDRESS !== lastKnownContractAddress && (
            <div className="bg-yellow-900/20 border border-yellow-500 text-yellow-400 p-3 rounded-lg text-center mb-5 animate-pulse">
              Contract address changed! Game state will reset.
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-400 p-3 rounded-lg text-center mb-5">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="bg-green-900/20 border border-green-500 text-green-400 p-3 rounded-lg text-center mb-5">
              {successMessage}
            </div>
          )}
          
          {renderGameScreen()}

          <div className="mt-8 border-t border-gray-700 pt-4">
            <p className="text-xs text-gray-400">
              <span className="font-medium">Note:</span> This is a privacy-preserving implementation using INCO homomorphic encryption. The contract address is set to <code className="bg-gray-800 px-1 py-0.5 rounded">{MAX_BALANCE_CALCULATOR_ADDRESS}</code>.
            </p>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-500">Current contract state: {
                currentState === 0 ? "INITIAL" : 
                currentState === 1 ? "ENTERED" : 
                currentState === 2 ? "COMPARED" : "UNKNOWN"
              }</p>
              <button 
                onClick={() => {
                  resetGameState();
                  fetchState();
                }}
                className="text-xs text-blue-500 hover:text-blue-400 flex items-center"
              >
                <RefreshCw size={12} className="mr-1" /> Force Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaxBalanceCalculator;