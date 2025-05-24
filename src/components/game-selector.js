"use client";

import React, { useState, useEffect } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { Factory, PlusCircle, Gamepad2, RefreshCw, Loader2 } from "lucide-react";
import { FACTORY_CONTRACT_ADDRESS, FACTORY_CONTRACT_ABI, MAX_BALANCE_CALCULATOR_ABI } from "@/utils/contract";
import "@/styles/GameSelector.css";
import "@/styles/TransactionStyles.css";

const GameSelector = ({ onSelectGame }) => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [deployedGames, setDeployedGames] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Fetch deployed games from the factory contract
  const fetchDeployedGames = async () => {
    setIsLoading(true);
    setError("");
    
    try {
      console.log("Fetching games from factory contract at:", FACTORY_CONTRACT_ADDRESS);
      const games = await publicClient.readContract({
        address: FACTORY_CONTRACT_ADDRESS,
        abi: FACTORY_CONTRACT_ABI,
        functionName: "getDeployedContracts",
      });
      
      console.log("Deployed games:", games);
      // Use a Set to remove any potential duplicates
      const uniqueGames = [...new Set(games || [])];
      setDeployedGames(uniqueGames);
    } catch (error) {
      console.error("Error fetching deployed games:", error);
      setError("Failed to load existing games. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Helper utility for delaying UI updates during blockchain confirmations
  const transactionDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Add transaction animation states
  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionMessage, setTransactionMessage] = useState("");
  const [transactionProgress, setTransactionProgress] = useState(0);
  
  // Create a new game contract
  const createNewGame = async () => {
    if (!walletClient || !address) {
      setError("Wallet not connected. Please connect your wallet.");
      return;
    }

    // Prevent multiple transactions
    if (isCreating || transactionPending) {
      setError("A transaction is already in progress. Please wait for it to complete.");
      return;
    }

    setIsCreating(true);
    setTransactionPending(true);
    setTransactionProgress(0);
    setError("");
    setSuccess("");
    setTransactionMessage("Preparing to create new game...");
    
    try {
      // Start the visual transaction animation
      const progressInterval = setInterval(() => {
        setTransactionProgress(prev => {
          const next = Math.min(prev + 1, 95);
          return next;
        });
      }, 200);
      
      await transactionDelay(1000); // Visual delay for better UX
      setTransactionMessage("Simulating transaction...");
      
      // Prepare the transaction
      const { request } = await publicClient.simulateContract({
        address: FACTORY_CONTRACT_ADDRESS,
        abi: FACTORY_CONTRACT_ABI,
        functionName: "createRichestx",
        account: address,
      });

      setTransactionMessage("Submitting to blockchain...");
      await transactionDelay(800); // Visual delay for better UX

      // Send the transaction
      const hash = await walletClient.writeContract(request);
      
      setSuccess("Creating new game. Please wait for confirmation...");
      setTransactionMessage("Waiting for blockchain confirmation...");

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });
      
      // Complete progress animation
      clearInterval(progressInterval);
      setTransactionProgress(100);

      // Get the game address from the ContractDeployed event
      const deployedEvent = receipt.logs.find(
        (log) => log.address.toLowerCase() === FACTORY_CONTRACT_ADDRESS.toLowerCase()
      );

      let newGameAddress;
      if (deployedEvent) {
        try {
          // For wagmi v2 and viem v2, we need to handle event decoding differently
          const event = {
            eventName: "ContractDeployed",
            args: {
              contractAddress: null
            }
          };
          
          // Try to get the new address directly from the transaction result
          newGameAddress = receipt.status === "success" ? 
            receipt.logs[0]?.address : null;
            
          // Alternatively, fetch deployed contracts and get the most recent one
          if (!newGameAddress) {
            setTransactionMessage("Looking for newly created game...");
            const updatedGames = await publicClient.readContract({
              address: FACTORY_CONTRACT_ADDRESS,
              abi: FACTORY_CONTRACT_ABI,
              functionName: "getDeployedContracts",
            });
            
            if (updatedGames && updatedGames.length > 0) {
              newGameAddress = updatedGames[updatedGames.length - 1];
            }
          }
        } catch (decodeError) {
          console.error("Error decoding event:", decodeError);
        }
      }
      
      // Don't refresh the list of games immediately
      // Instead show a waiting message while the contract deploys fully
      
      // Select the newly created game
      if (newGameAddress) {
        setSuccess(`New game created successfully at ${newGameAddress.substring(0, 6)}...${newGameAddress.substring(newGameAddress.length - 4)}`);
        
        // Add a longer delay to allow the contract to be fully deployed and accessible on the network
        setTransactionMessage("Waiting for contract deployment to complete...");
        setSuccess(`Game created! Waiting for contract deployment to complete...`);
        
        // Show progress updates during the waiting period (15 seconds total)
        for (let i = 0; i < 5; i++) {
          await transactionDelay(3000);
          setTransactionMessage(`Waiting for contract deployment... (${i+1}/5)`);
        }
        
        setTransactionMessage("Verifying contract deployment...");
        
        // Now that we've waited long enough, refresh the games list
        await fetchDeployedGames();
        
        setTransactionMessage("Game created successfully!");
        setSuccess(`New game created! Select it from the list below to enter.`);
        setTransactionPending(false);
        
        // Highlight the new game in the UI by scrolling to it after a short delay
        // to ensure the DOM has updated with the new game
        setTimeout(() => {
          const allGameButtons = document.querySelectorAll('.game-button');
          // Find the button that corresponds to the newly created game
          const newGameButton = Array.from(allGameButtons).find(
            button => button.id === `game-${newGameAddress}`
          );
          
          if (newGameButton) {
            newGameButton.classList.add('new-game-highlight');
            newGameButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 500);
      } else {
        setTransactionPending(false);
        setSuccess("New game created successfully. Please select it from the list below.");
      }

    } catch (error) {
      console.error("Error creating new game:", error);
      setError("Failed to create new game. Please try again.");
      setTransactionPending(false);
    } finally {
      setIsCreating(false);
    }
  };

  // Load games when component mounts
  useEffect(() => {
    if (address && publicClient) {
      fetchDeployedGames();
    }
  }, [address, publicClient]);

  return (
    <div className="game-selector-container">
      <div className="game-selector-header">
        <h2 className="game-selector-title">
          <Factory className="title-icon" />
          Secret Max Balance Games
        </h2>
        
        <div>
          <button
            onClick={fetchDeployedGames}
            disabled={isLoading}
            className="refresh-button"
          >
            {isLoading ? (
              <Loader2 className="loader" style={{width: "1rem", height: "1rem"}} />
            ) : (
              <RefreshCw style={{width: "1rem", height: "1rem"}} />
            )}
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {success && (
        <div className="success-message">
          {success}
        </div>
      )}
      
      {transactionPending && (
        <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-md mb-4 animate-fade-in transaction-progress-container transaction-pulse">
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
      )}

      <div>
        <button
          onClick={createNewGame}
          disabled={isCreating}
          className="create-button"
        >
          {isCreating ? (
            <>
              <Loader2 className="loader" style={{width: "1.25rem", height: "1.25rem"}} />
              Creating Game...
            </>
          ) : (
            <>
              <PlusCircle style={{width: "1.5rem", height: "1.5rem"}} />
              Launch New Yacht
            </>
          )}
        </button>
      </div>

      <div>
        <h3 className="existing-games-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="games-icon">
            <path d="M3 9h18m0 0-8-5H7l3 5m11 0v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8"/>
          </svg>
          Available Yachts
        </h3>
        
        {isLoading ? (
          <div className="loading-container">
            <Loader2 className="loader" style={{width: "1.5rem", height: "1.5rem"}} />
          </div>
        ) : deployedGames.length > 0 ? (
          <div className="games-grid">
            {deployedGames.map((gameAddress, index) => (
              <button
                key={gameAddress}
                onClick={() => onSelectGame(gameAddress)}
                className="game-button"
                id={`game-${gameAddress}`}
              >
                <div className="game-info">
                  <div className="game-number">
                    {index + 1}
                  </div>
                  <div className="game-details">
                    <div className="game-name">Luxury Yacht #{index + 1}</div>
                    <div className="game-address">
                      {gameAddress.substring(0, 8)}...{gameAddress.substring(gameAddress.length - 6)}
                    </div>
                  </div>
                </div>
                <span className="select-text">Select &rarr;</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="no-games">
            <div className="w-16 h-16 mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#e0a955]">
                <path d="M3 9h18m0 0-8-5H7l3 5m11 0v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8"/>
              </svg>
            </div>
            <p className="text-white text-lg mb-2">No yachts available in the harbor</p>
            <p className="text-[#e0a955]/70">Be the first millionaire to launch one!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameSelector;
