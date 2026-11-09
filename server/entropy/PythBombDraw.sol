// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Sorteio do Pyth Bomb PVP com Pyth Entropy (biblioteca oficial @pythnetwork/entropy-sdk-solidity 2.2.1).
//
// Como funciona (um pedido por torneio):
//  1. O servidor de jogo sorteia um SEGREDO e manda só a "impressão digital" dele (commit = sha256(segredo))
//     junto com o pedido. Ela fica gravada aqui ANTES de o Entropy responder.
//  2. O Entropy devolve um número aleatório (randomOf) num segundo momento, pelo entropyCallback.
//  3. A semente do torneio = sha256(segredo || número do Entropy). Ninguém prevê (o segredo está escondido) e o
//     servidor não consegue escolher (a impressão digital foi gravada antes do número sair).
//  4. No fim do torneio o servidor revela o segredo: qualquer um confere sha256(segredo) == commit e refaz a semente.
//
// Só o dono (a carteira do servidor que publicou o contrato) pode pedir sorteios.

import "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";

contract PythBombDraw is IEntropyConsumer {
    IEntropyV2 public immutable entropy;
    address public immutable owner;

    mapping(uint64 => bytes32) public commitOf; // impressão digital do segredo de cada pedido
    mapping(uint64 => bytes32) public randomOf; // número do Entropy de cada pedido (0 = ainda não chegou)

    event Requested(uint64 indexed sequence, bytes32 commit);
    event Drawn(uint64 indexed sequence, bytes32 commit, bytes32 random);

    constructor(address entropyAddress) {
        entropy = IEntropyV2(entropyAddress);
        owner = msg.sender;
    }

    // taxa atual do Entropy (muda com o preço do gás)
    function fee() external view returns (uint256) {
        return entropy.getFeeV2();
    }

    // pede um número; manda a taxa junto (o troco volta pro dono)
    function request(bytes32 commit) external payable returns (uint64 sequence) {
        require(msg.sender == owner, "only owner");
        uint256 f = entropy.getFeeV2();
        require(msg.value >= f, "fee too low");
        sequence = entropy.requestV2{value: f}();
        commitOf[sequence] = commit;
        emit Requested(sequence, commit);
        if (msg.value > f) {
            (bool ok, ) = payable(owner).call{value: msg.value - f}("");
            ok; // se o troco falhar, ele fica no contrato (não trava o pedido)
        }
    }

    // resposta do Entropy: só grava (nunca pode dar erro)
    function entropyCallback(uint64 sequence, address, bytes32 randomNumber) internal override {
        randomOf[sequence] = randomNumber;
        emit Drawn(sequence, commitOf[sequence], randomNumber);
    }

    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }
}
