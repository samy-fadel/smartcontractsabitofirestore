const { PubSub } = require('@google-cloud/pubsub');
const Web3 = require('web3');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { v1 } = require('@google-cloud/pubsub');
const admin = require('firebase-admin');

const projectId = process.env.PROJECT_ID;
const smartContractsSubscriptionName = 'smart-contracts-transactions-sub'; // New Pub/Sub subscription for smart contracts

const client = new v1.SubscriberClient();

// Function to initialize Firebase Admin SDK
admin.initializeApp({
  projectId: projectId,
});

// Function to retrieve the API key from Secret Manager
async function getApiKey() {
  const secretName = `projects/${process.env.PROJECT_NUMBER}/secrets/web3-api-key/versions/latest`;
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({ name: secretName });
  return version.payload.data.toString();
}

// Function to store smart contract in Firestore
async function storeSmartContractInFirestore(address, abi) {
  const db = admin.firestore();
  const smartContractsCollection = db.collection('smartcontracts');
  await smartContractsCollection.doc(address).set({ abi });
  console.log(`Smart contract with address ${address} stored in Firestore.`);
}

async function retrieveSmartContracts() {
  const apiKey = await getApiKey();
  const web3 = new Web3(`https://mainnet.infura.io/v3/${apiKey}`);
  let continueProcessing = true;

  while (continueProcessing) {
    try {
      const request = {
        subscription: client.subscriptionPath(process.env.PROJECT_ID, smartContractsSubscriptionName), // Use the new smart contract subscription
        maxMessages: 50, // Process messages in batches of 50
      };

      const [response] = await client.pull(request);
      const messages = response.receivedMessages;

      if (messages && messages.length > 0) {
        for (const message of messages) {
          const address = message.message.data.toString();
          console.log("Smart Contract Address:", address);
          console.log("Received Message:", message.message.data.toString());

          // Get the JSON ABI for the smart contract
          //const contract = new web3.eth.Contract([], address); // Provide an empty ABI here, we'll fetch the real ABI next
          //const abi = await contract.methods._jsonInterface; // Fetch the JSON ABI
          const abi = await web3.eth.contract(contractAddress).getABI();

          console.log("JSON ABI:", abi);

          // Store the smart contract in Firestore
          await storeSmartContractInFirestore(address, abi);
        }

        const ackRequest = {
          subscription: request.subscription,
          ackIds: messages.map((msg) => msg.ackId),
        };

        await client.acknowledge(ackRequest);
      } else {
        console.log('No more messages to process. Exiting loop.');
        continueProcessing = false;
      }
    } catch (error) {
      console.error('Error retrieving smart contracts:', error);
      continueProcessing = false;
    }
  }
}

retrieveSmartContracts();