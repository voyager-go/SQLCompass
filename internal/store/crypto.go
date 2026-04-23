package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
)

const encPrefix = "enc:"

// encryptionKey is the AES-256 key derived from a machine-specific identifier.
var encryptionKey []byte

// SetEncryptionKey derives a 32-byte AES key from the given key material string.
func SetEncryptionKey(keyMaterial string) {
	h := sha256.Sum256([]byte(keyMaterial))
	encryptionKey = h[:]
}

// encrypt encrypts plaintext using AES-GCM and returns a base64-encoded string
// with the "enc:" prefix. The nonce is prepended to the ciphertext.
func encrypt(plaintext string) (string, error) {
	if encryptionKey == nil {
		return plaintext, nil
	}
	if plaintext == "" {
		return "", nil
	}

	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	encoded := base64.StdEncoding.EncodeToString(ciphertext)
	return encPrefix + encoded, nil
}

// decrypt decrypts a base64-encoded AES-GCM ciphertext (with "enc:" prefix).
// If the input does not have the "enc:" prefix, it is returned as-is for
// backward compatibility with plaintext passwords.
func decrypt(ciphertext string) (string, error) {
	if !strings.HasPrefix(ciphertext, encPrefix) {
		return ciphertext, nil
	}
	if encryptionKey == nil {
		return ciphertext, nil
	}

	data, err := base64.StdEncoding.DecodeString(ciphertext[len(encPrefix):])
	if err != nil {
		return "", fmt.Errorf("decode base64: %w", err)
	}

	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertextBytes := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertextBytes, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}

	return string(plaintext), nil
}

// isEncrypted returns true if the value has the encrypted prefix.
func isEncrypted(value string) bool {
	return strings.HasPrefix(value, encPrefix)
}
