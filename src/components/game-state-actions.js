"use client";

import React, { useState, useEffect } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { Loader2, ArrowRight, FileOutput, Check, AlertCircle } from "lucide-react";
import { MAX_BALANCE_CALCULATOR_ABI } from "@/utils/contract";
import "@/styles/GameStateActions.css";
import "@/styles/TransactionStyles.css";

// Add a helper utility for delaying UI updates during blockchain confirmations
const transactionDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const GameStateActions = ({ gameAddress, showActionButtons = true }) => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  const [contractState, setContractState] = useState(0); // 0: NotEntered, 1: Entered, 2: Compared
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingOutput, setIsLoadingOutput] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [outputResult, setOutputResult] = useState("");
  
  // Add transaction animation states
  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionMessage, setTransactionMessage] = useState("");
  const [transactionProgress, setTransactionProgress] = useState(0);
  const [buttonVisible, setButtonVisible] = useState(true);
  const [compareReady, setCompareReady] = useState(false);
  const [outputButtonReady, setOutputButtonReady] = useState(false);
  
  // Compare balances if all players have entered their balances
  const compareBalances = async () => {
    if (!walletClient || !address) {
      setError("Wallet not connected. Please connect your wallet.");
      return;
    }
    
    setIsSubmitting(true);
    setError("");
    setTransactionPending(true);
    setTransactionMessage("Preparing transaction...");
    setTransactionProgress(0);
    
    try {
      const { request } = await publicClient.simulateContract({
        address: gameAddress,
        abi: MAX_BALANCE_CALCULATOR_ABI,
        functionName: "compare",
        account: address,
      });

      // Send the transaction
      const hash = await walletClient.writeContract(request);
      
      setTransactionMessage("Transaction sent! Waiting for confirmation...");
      setTransactionProgress(50);

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });
      
      setTransactionProgress(100);
      
      if (receipt.status === "success") {
        setSuccess("Comparison completed! 🎉");
        setTransactionMessage("Transaction confirmed! Processing on blockchain...");
        setButtonVisible(false);
        
        // Set flag to do more frequent state checks
        setRecentlyCompared(true);
        
        // Add a longer delay to allow blockchain state to fully update
        // Show a processing message to the user during this time
        await transactionDelay(2000);
        setTransactionMessage("Waiting for blockchain state to update...");
        await transactionDelay(10000); // 12 seconds total delay, giving blockchain plenty of time
        
        // Show success message
        setTransactionMessage("Blockchain state updated! Results ready to view.");
        await transactionDelay(1500);
        setTransactionPending(false);
        
        // Now re-fetch the contract state
        await checkContractState();
        
        // Set up additional state checks with increasing delays
        setTimeout(() => checkContractState(), 5000);
        setTimeout(() => checkContractState(), 10000);
        setTimeout(() => checkContractState(), 20000);
      } else {
        setError("Comparison failed. Please try again.");
        setTransactionMessage("Transaction failed. Please try again.");
      }
    } catch (error) {
      console.error("Error comparing balances:", error);
      setError(`Failed to compare balances: ${error.message || "Please try again."}`);
      setTransactionMessage("Error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
      setTransactionPending(false);
    }
  };

  // Fetch and set the output result from the contract
  const fetchOutputResult = async () => {
    setIsLoadingOutput(true);
    setError("");
    setSuccess(""); // Clear any previous success messages
    
    try {
      // Add loading animation
      setTransactionMessage("Fetching results from blockchain...");
      setTransactionPending(true);
      setTransactionProgress(0);
      
      // Progress animation
      const progressInterval = setInterval(() => {
        setTransactionProgress(prev => {
          const next = Math.min(prev + 2, 95);
          return next;
        });
      }, 100);
      
      await transactionDelay(1500); // Add a visual delay
      
      // Retry mechanism for reading output
      let result;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          setTransactionMessage(`Retrieving results from blockchain... ${retryCount > 0 ? `(Attempt ${retryCount + 1}/${maxRetries})` : ''}`);
          
          result = await publicClient.readContract({
            address: gameAddress,
            abi: MAX_BALANCE_CALCULATOR_ABI,
            functionName: "output",
          });
          
          // If we get here without error, break the loop
          break;
        } catch (readError) {
          console.warn(`Attempt ${retryCount + 1}/${maxRetries} to read output failed:`, readError);
          retryCount++;
          
          if (retryCount >= maxRetries) {
            throw new Error("Blockchain state not yet ready. Please wait a few more seconds and try again.");
          }
          
          // Wait between retries
          await transactionDelay(3000);
        }
      }
      
      console.log("Output result:", result);
      
      // Clear interval and complete progress
      clearInterval(progressInterval);
      setTransactionProgress(100);
      
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
      
      await transactionDelay(800); // Add a visual delay for better UX
      
      setOutputResult(formattedOutput);
      setSuccess("Results retrieved successfully!");
      setTransactionPending(false);
    } catch (error) {
      console.error("Error fetching output result:", error);
      setError(`${error.message || "Failed to fetch output result. Please try again."}`);
      setTransactionPending(false);
      
      // If we failed, let's schedule another contract state check
      // This helps recover automatically when the blockchain eventually updates
      setTimeout(() => checkContractState(), 5000);
    } finally {
      setIsLoadingOutput(false);
    }
  };

  // Check and update contract state
  const checkContractState = async () => {
    if (!gameAddress || !publicClient) return;
    
    try {
      const state = await publicClient.readContract({
        address: gameAddress,
        abi: MAX_BALANCE_CALCULATOR_ABI,
        functionName: "currentState",
      });
      
      console.log("Current contract state:", state);
      setContractState(Number(state));
      
      // Check if we can compare balances
      if (Number(state) === 1) {
        setCompareReady(true);
      } else {
        setCompareReady(false);
      }
      
      // Check if output button should be enabled
      // We'll add additional safety here to ensure the comparison has fully completed
      if (Number(state) === 2) {
        // Double-check if comparison is truly complete by trying to read output
        // This ensures the button only appears when output is truly available
        try {
          // Just verify we can read the output (without displaying it yet)
          await publicClient.readContract({
            address: gameAddress,
            abi: MAX_BALANCE_CALCULATOR_ABI,
            functionName: "output",
          });
          // If we successfully read the output, then enable the button
          setOutputButtonReady(true);
        } catch (outputError) {
          console.warn("Output not yet available:", outputError);
          setOutputButtonReady(false);
        }
      } else {
        setOutputButtonReady(false);
      }
    } catch (error) {
      console.warn("Error fetching contract state:", error);
    }
  };

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

  // Track if a comparison was recently performed
  const [recentlyCompared, setRecentlyCompared] = useState(false);

  // Check contract state on component mount and periodically
  useEffect(() => {
    if (gameAddress && publicClient) {
      checkContractState();
      
      // Determine check interval - more frequent after a comparison
      const checkInterval = contractState === 1 || recentlyCompared ? 3000 : 10000;
      
      // Set up a periodic check for contract state
      const intervalId = setInterval(() => {
        checkContractState();
        
        // If we've been checking frequently after a comparison, 
        // reset to normal frequency after some time
        if (recentlyCompared) {
          setTimeout(() => {
            setRecentlyCompared(false);
          }, 30000); // Reset to normal frequency after 30 seconds
        }
      }, checkInterval);
      
      return () => clearInterval(intervalId);
    }
  }, [gameAddress, publicClient, contractState, recentlyCompared]);

  if (!gameAddress) return null;

  return (
    <div className="mb-8">
      {/* State indicator - only show when showActionButtons is false */}
      {!showActionButtons && (
        <div className="mb-6 flex items-center justify-center">
          <span className="text-gray-400 text-lg mr-2">Game State:</span>
          <span className={`text-base font-medium px-4 py-1.5 rounded-full ${
            contractState === 0 
              ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" 
              : contractState === 1 
              ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              : "bg-green-500/20 text-green-400 border border-green-500/30"
          }`}>
            {getStateLabel()}
          </span>
        </div>
      )}
      
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
      
      {/* Action buttons - only shown if showActionButtons is true */}
      {showActionButtons && (
        <>
          {/* Compare Button */}
          {contractState === 1 && (
            <div className="mb-6">
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
                <h3 className="text-white text-lg mb-4 text-center">All Players Have Entered Their Balances</h3>
                <div className="text-center text-green-400 mb-4">
                  You can now compare the balances to determine the winner
                </div>
                <button
                  onClick={compareBalances}
                  disabled={isSubmitting || transactionPending}
                  className={`px-8 py-3 rounded-lg flex items-center justify-center mx-auto shadow-lg ${
                    isSubmitting || transactionPending
                      ? "bg-[#1f5d88]/30 cursor-not-allowed"
                      : "bg-gradient-to-r from-[#1f5d88] to-[#2a7dad] hover:from-[#2a7dad] hover:to-[#1f5d88] hover:scale-105"
                  } text-white transition-all font-medium`}
                >
                  {transactionPending ? (
                    <>
                      <Loader2 className="animate-spin w-5 h-5 mr-2" />
                      {transactionMessage}
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-5 h-5 mr-2" />
                      Compare Net Worth
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
          
          {/* Output Section */}
          {contractState === 2 && (
            <div className="mb-8">
              <div className="yacht-container p-8 card-glow border-[#e0a955]/30">
                <div className="flex items-center justify-center mb-6">
                  <div className="w-12 h-12 rounded-full bg-[#e0a955]/20 flex items-center justify-center mr-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#e0a955]">
                      <path d="M12 2v2"/>
                      <path d="M12 20v2"/>
                      <path d="m4.93 4.93 1.41 1.41"/>
                      <path d="m17.66 17.66 1.41 1.41"/>
                      <path d="M2 12h2"/>
                      <path d="M20 12h2"/>
                      <path d="m6.34 17.66-1.41 1.41"/>
                      <path d="m19.07 4.93-1.41 1.41"/>
                      <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/>
                    </svg>
                  </div>
                  <h3 className="text-[#e0a955] text-2xl font-semibold">Millionaire's Dilemma Results</h3>
                </div>
                
                {!outputButtonReady && !outputResult && (
                  <div className="text-center mb-6">
                    <div className="bg-[#1f5d88]/20 border border-[#1f5d88]/40 text-white/80 p-5 rounded-lg backdrop-blur-sm">
                      <div className="w-14 h-14 mx-auto mb-3 relative">
                        <div className="absolute inset-0 rounded-full border-4 border-t-transparent border-[#e0a955] animate-spin"></div>
                        <div className="absolute inset-0 m-auto text-white/70 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                          </svg>
                        </div>
                      </div>
                      <p className="text-lg">Finalizing yacht competition results...</p>
                      <p className="text-white/60 mt-2">Please wait while the blockchain verifies the winner</p>
                    </div>
                  </div>
                )}
                
                {outputResult ? (
                  <div className="bg-[#0e1e32]/60 p-6 rounded-lg border border-[#1f5d88]/40 mb-6 text-center backdrop-blur-sm">
                    <div className="bg-[#1f5d88]/20 p-5 rounded-lg border border-[#e0a955]/20 inline-block max-w-lg">
                      <pre className="text-white text-lg whitespace-pre-wrap font-medium">{outputResult}</pre>
                    </div>
                    <div className="mt-4 flex justify-center">
                      <img src="https://img.icons8.com/fluency/96/champagne.png" alt="Winner" className="h-14" />
                    </div>
                  </div>
                ) : outputButtonReady && (
                  <div className="text-center text-white/80 mb-6 bg-[#0e1e32]/60 p-6 rounded-lg border border-[#1f5d88]/40 animate-fade-in backdrop-blur-sm">
                    <p className="mb-3">The competition has ended! All millionaires have submitted their net worth.</p>
                    <p className="text-[#e0a955]">Click below to reveal the wealthiest yacht guest</p>
                  </div>
                )}
                
                {outputButtonReady && (
                  <button
                    onClick={fetchOutputResult}
                    disabled={isLoadingOutput}
                    className={`px-8 py-4 rounded-lg flex items-center justify-center mx-auto animate-button-appear ${
                      isLoadingOutput
                        ? "bg-[#1f5d88]/30 cursor-not-allowed"
                        : "bg-gradient-to-r from-[#e0a955] to-[#d4924a] hover:from-[#eab76b] hover:to-[#e0a955] text-[#0a121e] hover:scale-105"
                    } transition-all font-semibold shadow-lg`}
                  >
                    {isLoadingOutput ? (
                      <Loader2 className="animate-spin w-5 h-5" />
                    ) : (
                      <>
                        <FileOutput className="w-5 h-5 mr-2" />
                        {outputResult ? "Refresh Results" : "Reveal the Winner"}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default GameStateActions;
