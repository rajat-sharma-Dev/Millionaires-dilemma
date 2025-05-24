"use client";

import React, { useState, useEffect } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { Loader2, Database, Check, AlertCircle, ArrowRight, FileOutput, User } from "lucide-react";
import { MAX_BALANCE_CALCULATOR_ABI } from "@/utils/contract";
import { encryptValue } from "@/utils/inco-lite";
import "@/styles/TransactionStyles.css";

// Add a helper utility for delaying UI updates during blockchain confirmations
const transactionDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const BalanceInput = ({ gameAddress, playerName, onBalanceSubmitted }) => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  const [balance, setBalance] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [allPlayersStatus, setAllPlayersStatus] = useState({
    Alice: false,
    Bob: false,
    Eve: false,
  });
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [contractState, setContractState] = useState(0); // 0: NotEntered, 1: Entered, 2: Compared
  const [isLoadingOutput, setIsLoadingOutput] = useState(false);
  const [outputResult, setOutputResult] = useState("");
  
  // Add transaction animation states
  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionMessage, setTransactionMessage] = useState("");
  const [transactionProgress, setTransactionProgress] = useState(0);

  // Handle balance input change
  const handleBalanceChange = (e) => {
    // Only allow numbers
    const value = e.target.value.replace(/[^0-9]/g, "");
    setBalance(value);
  };

  // Submit encrypted balance to the contract
  const submitBalance = async () => {
    if (!walletClient || !address) {
      setError("Wallet not connected. Please connect your wallet.");
      return;
    }

    if (!balance || isNaN(parseInt(balance)) || parseInt(balance) <= 0) {
      setError("Please enter a valid balance greater than 0.");
      return;
    }

    // Prevent multiple transactions
    if (isSubmitting || transactionPending) {
      setError("A transaction is already in progress. Please wait for it to complete.");
      return;
    }

    setIsSubmitting(true);
    setTransactionPending(true);
    setTransactionProgress(0);
    setError("");
    setSuccess("");
    setTransactionMessage("Encrypting your balance...");

    try {
      console.log(`Encrypting balance ${balance} for player ${playerName} at game ${gameAddress}`);

      // Start the visual transaction animation
      const progressInterval = setInterval(() => {
        setTransactionProgress(prev => {
          const next = Math.min(prev + 1, 95);
          return next;
        });
      }, 200);

      // Encrypt the balance value
      const encryptedBalance = await encryptValue({
        value: parseInt(balance),
        address: address,
        contractAddress: gameAddress,
      });

      console.log("Encrypted balance:", encryptedBalance);
      setTransactionMessage("Preparing transaction...");
      await transactionDelay(1000); // Slow down the process for better UX

      // Call the enterBalance function
      const { request } = await publicClient.simulateContract({
        address: gameAddress,
        abi: MAX_BALANCE_CALCULATOR_ABI,
        functionName: "enterBalance",
        account: address,
        args: [encryptedBalance, playerName],
      });

      setTransactionMessage("Submitting to blockchain...");
      await transactionDelay(800); // Slow down the process for better UX

      // Send the transaction
      const hash = await walletClient.writeContract(request);
      
      setSuccess(`Submitting balance for ${playerName}. Please wait for confirmation...`);
      setTransactionMessage("Waiting for blockchain confirmation...");

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });
      
      // Clear the progress animation
      clearInterval(progressInterval);
      setTransactionProgress(100);
      
      if (receipt.status === "success") {
        setTransactionMessage("Transaction confirmed!");
        await transactionDelay(1500); // Show success state for a moment
        
        setSuccess(`Balance submitted successfully for ${playerName}! You can now select another player if needed.`);
        if (onBalanceSubmitted) {
          onBalanceSubmitted();
        }
        
        // Ensure some delay before checking status to allow blockchain state to update
        await transactionDelay(3000);
        
        // Check player statuses
        checkAllPlayersStatus();
      } else {
        setError("Transaction failed. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting balance:", error);
      setError(`Failed to submit balance: ${error.message || "Please try again."}`);
    } finally {
      setIsSubmitting(false);
      setTransactionPending(false);
    }
  };

  // Track retry attempts
  const [statusRetryCount, setStatusRetryCount] = useState(0);
  const MAX_STATUS_RETRIES = 5;

  // Check status of all players
  const checkAllPlayersStatus = async () => {
    setIsCheckingStatus(true);
    
    try {
      const playerNames = ["Alice", "Bob", "Eve"];
      const updatedStatus = { ...allPlayersStatus };
      let contractAccessible = false;
      
      for (const name of playerNames) {
        try {
          const playerAddress = await publicClient.readContract({
            address: gameAddress,
            abi: MAX_BALANCE_CALCULATOR_ABI,
            functionName: "getBy",
            args: [name],
          });
          
          // If we got here, at least the contract is accessible
          contractAccessible = true;
          
          // If address is not zero, player has been selected
          updatedStatus[name] = playerAddress !== "0x0000000000000000000000000000000000000000";
        } catch (error) {
          console.warn(`Error checking status for ${name}:`, error);
        }
      }

      if (!contractAccessible && statusRetryCount < MAX_STATUS_RETRIES) {
        // If contract is not accessible, retry after delay
        console.log(`Cannot access contract for status check. Retrying... (${statusRetryCount + 1}/${MAX_STATUS_RETRIES})`);
        setStatusRetryCount(prev => prev + 1);
        
        setTimeout(() => {
          checkAllPlayersStatus();
        }, 3000);
        return;
      } else if (!contractAccessible) {
        // After max retries, show error
        setError("Unable to check player statuses. The contract may not be fully deployed yet. Please try again later.");
      } else {
        // Reset retry count and update statuses
        setStatusRetryCount(0);
        setAllPlayersStatus(updatedStatus);
        
        // Check if all players have entered their balances
        const allEntered = updatedStatus.Alice && updatedStatus.Bob && updatedStatus.Eve;
        if (allEntered && contractState === 0) {
          // If all players have entered and state is still NotEntered, update to Entered
          setContractState(1);
        }
        
        // Check and update contract state
        try {
          const state = await publicClient.readContract({
            address: gameAddress,
            abi: MAX_BALANCE_CALCULATOR_ABI,
            functionName: "currentState",
          });
          
          console.log("Current contract state:", state);
          setContractState(Number(state));
          
          // If the state is Compared (2), automatically fetch the output
          if (Number(state) === 2 && !outputResult) {
            fetchOutputResult();
          }
        } catch (stateError) {
          console.warn("Error fetching contract state:", stateError);
        }
      }
    } catch (error) {
      console.error("Error checking all players status:", error);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Compare balances if all players have entered their balances
  const compareBalances = async () => {
    setIsSubmitting(true);
    setError("");
    
    try {
      const { request } = await publicClient.simulateContract({
        address: gameAddress,
        abi: MAX_BALANCE_CALCULATOR_ABI,
        functionName: "compare",
        account: address,
      });

      // Send the transaction
      const hash = await walletClient.writeContract(request);
      
      setSuccess("Comparing balances. Please wait for confirmation...");

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });
      
      if (receipt.status === "success") {
        setSuccess("Comparison completed! You can now check the results.");
        setContractState(2); // Set contract state to Compared
      } else {
        setError("Comparison failed. Please try again.");
      }
    } catch (error) {
      console.error("Error comparing balances:", error);
      setError(`Failed to compare balances: ${error.message || "Please try again."}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fetch and set the output result from the contract
  const fetchOutputResult = async () => {
    setIsLoadingOutput(true);
    setError("");
    setSuccess(""); // Clear any previous success messages
    
    try {
      const result = await publicClient.readContract({
        address: gameAddress,
        abi: MAX_BALANCE_CALCULATOR_ABI,
        functionName: "output",
      });
      
      console.log("Output result:", result);
      
      // Format the output for better display
      let formattedOutput = result;
      if (result.includes("has the maximum balance")) {
        // Add celebratory emojis
        formattedOutput = `🏆 ${result} 🏆`;
        
        // Highlight player names with sparkles
        formattedOutput = formattedOutput
          .replace(/Alice/g, "✨ Alice ✨")
          .replace(/Bob/g, "✨ Bob ✨")
          .replace(/Eve/g, "✨ Eve ✨");
      }
      
      setOutputResult(formattedOutput);
      setSuccess("Results retrieved successfully!");
    } catch (error) {
      console.error("Error fetching output result:", error);
      setError("Failed to fetch output result. Please try again.");
    } finally {
      setIsLoadingOutput(false);
    }
  };

  // Check all player statuses on component mount
  useEffect(() => {
    if (gameAddress && publicClient) {
      checkAllPlayersStatus();
      
      // Set up a periodic check for player statuses
      const intervalId = setInterval(() => {
        checkAllPlayersStatus();
      }, 10000); // Check every 10 seconds
      
      return () => clearInterval(intervalId);
    }
  }, [gameAddress, publicClient]);

  // Check if all players have entered their balances
  const allPlayersReady = allPlayersStatus.Alice && allPlayersStatus.Bob && allPlayersStatus.Eve;

  // Helper function to get state label
  const getStateLabel = () => {
    switch (contractState) {
      case 0:
        return "Not Entered";
      case 1:
        return "Balances Entered";
      case 2:
        return "Comparison Complete";
      default:
        return "Unknown";
    }
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
      <h2 className="text-white text-xl font-medium mb-6 text-center">Enter Your Balance</h2>
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-3 mb-6 rounded-md text-sm">
          <div className="flex items-center">
            <AlertCircle className="w-4 h-4 mr-2" />
            {error}
          </div>
        </div>
      )}
      
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-500 p-3 mb-6 rounded-md text-sm">
          <div className="flex items-center">
            <Check className="w-4 h-4 mr-2" />
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
      
      <div className="mb-6">
        <div className="text-gray-300 mb-2">Current Player: <span className="text-blue-400 font-medium">{playerName}</span></div>
        <label className="block text-gray-300 mb-2">
          Enter your balance:
        </label>
        <div className="relative">
          <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#e0a955]">
              <path d="M20.2 7.8l-7.7 7.7-4-4-5.7 5.7"/>
              <path d="M15 7h6v6"/>
            </svg>
          </div>
          <input
            type="text"
            value={balance}
            onChange={handleBalanceChange}
            placeholder="Enter net worth (in millions)"
            disabled={isSubmitting}
            className="bg-[#0e1e32]/80 text-white pl-12 pr-4 py-4 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-[#e0a955] flex-grow border border-[#1f5d88]/50 shadow-inner w-full"
          />
          <button
            onClick={submitBalance}
            disabled={isSubmitting || !balance}
            className={`px-8 py-4 rounded-r-lg flex items-center justify-center ${
              isSubmitting || !balance
                ? "bg-[#1f5d88]/30 cursor-not-allowed"
                : "bg-gradient-to-r from-[#e0a955] to-[#d4924a] hover:from-[#eab76b] hover:to-[#e0a955] text-[#0a121e]"
            } transition-all absolute right-0 top-0 h-full font-medium`}
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin w-5 h-5" />
            ) : (
              <>
                <Database className="w-5 h-5 mr-2" />
                Submit
              </>
            )}
          </button>
        </div>
      </div>
      
      <div className="mb-8 mt-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-[#1f5d88]/50 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#e0a955]">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <h3 className="text-white text-xl font-semibold">Guest Status</h3>
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(allPlayersStatus).map(([name, hasEntered]) => (
            <div 
              key={name} 
              className={`p-4 border rounded-lg flex flex-col items-center backdrop-blur-sm ${
                hasEntered
                  ? "border-[#e0a955]/40 bg-[#1f5d88]/20"
                  : "border-[#1f5d88]/30 bg-[#0e1e32]/60"
              }`}
            >
              <div className={`w-12 h-12 rounded-full mb-3 flex items-center justify-center
                ${hasEntered ? "bg-[#1f5d88]" : "bg-[#1f5d88]/30"}`}
              >
                <User className={`w-6 h-6 ${hasEntered ? "text-[#e0a955]" : "text-white/60"}`} />
              </div>
              <span className={`text-lg font-medium mb-1 ${hasEntered ? "text-[#e0a955]" : "text-white"}`}>{name}</span>
              <div className={`text-sm px-3 py-1 rounded-full mt-1 font-medium
                ${hasEntered 
                  ? "bg-[#e0a955]/20 text-[#e0a955]" 
                  : "bg-[#0e1e32]/80 text-white/60"}`
              }>
                {hasEntered ? "Net Worth Submitted" : "Awaiting Submission"}
              </div>
            </div>
          ))}
        </div>
        
        {isCheckingStatus && (
          <div className="mt-4 text-center flex items-center justify-center gap-2">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent border-[#e0a955] animate-spin"></div>
            <span className="text-white/70">Refreshing yacht guest status...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default BalanceInput;
