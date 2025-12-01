#!/bin/bash
set -e

echo "=========================="
echo " INSTALLACJA MetalLB"
echo "=========================="

kubectl create namespace metallb-system --dry-run=client -o yaml | kubectl apply -f -

helm repo add metallb https://metallb.github.io/metallb
helm repo update

helm upgrade --install metallb metallb/metallb -n metallb-system

echo "==> Zastosowanie AddressPool"
kubectl apply -f metallb-pool.yaml

echo "==> Sprawdzanie MetalLB"
kubectl -n metallb-system get all


echo "=========================="
echo " INSTALLACJA Envoy Gateway"
echo "=========================="

kubectl create namespace envoy-gateway-system --dry-run=client -o yaml | kubectl apply -f -

helm repo add envoy-gateway https://envoyproxy.github.io/gateway-helm-charts
helm repo update

helm upgrade --install envoy-gateway envoy-gateway/gateway-helm \
  -n envoy-gateway-system \
  --set replicaCount=2 \
  --set service.type=LoadBalancer

echo "==> Oczekiwanie na EXTERNAL-IP z MetalLB..."

# Czekamy na External IP
for i in {1..60}; do
  IP=$(kubectl -n envoy-gateway-system get svc envoy-gateway --no-headers | awk '{print $4}')
  if [[ "$IP" != "<pending>" && "$IP" != "" ]]; then
    echo "==> EXTERNAL-IP przydzielony: $IP"
    break
  fi
  echo "Czekam na przydzielenie IP..."
  sleep 5
done

if [[ "$IP" == "<pending>" || "$IP" == "" ]]; then
  echo "❌ ERROR: MetalLB nie przydzielił IP!"
  exit 1
fi

echo "==> Stosowanie gateway.yaml"
kubectl apply -f gateway.yaml


echo "=========================="
echo " INSTALLACJA cert-manager"
echo "=========================="

kubectl create namespace cert-manager --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.crds.yaml

helm repo add jetstack https://charts.jetstack.io
helm repo update

helm upgrade --install cert-manager jetstack/cert-manager -n cert-manager

echo "==> Oczekiwanie na gotowość cert-manager..."

kubectl wait --for=condition=available --timeout=180s deployment/cert-manager -n cert-manager
kubectl wait --for=condition=available --timeout=180s deployment/cert-manager-webhook -n cert-manager
kubectl wait --for=condition=available --timeout=180s deployment/cert-manager-cainjector -n cert-manager

kubectl apply -f cert-issuer-prod.yaml
kubectl apply -f cert-issuer-staging.yaml



echo "=========================="
echo " INSTALACJA LONGHORN"
echo "=========================="

kubectl create namespace longhorn-system --dry-run=client -o yaml | kubectl apply -f -

helm repo add longhorn https://charts.longhorn.io
helm repo update

helm upgrade --install longhorn longhorn/longhorn \
  -n longhorn-system \
  --set defaultSettings.replicaAutoBalance=least-effort \
  --set persistence.defaultClassReplicaCount=3

echo "==> Czekanie na Longhorn CRD i komponenty..."
kubectl wait --for=condition=available --timeout=600s deployment/longhorn-manager -n longhorn-system
kubectl wait --for=condition=available --timeout=600s deployment/longhorn-ui -n longhorn-system
kubectl wait --for=condition=available --timeout=600s deployment/longhorn-driver-deployer -n longhorn-system

kubectl apply -f LonghornEncrypt.yaml
kubectl apply -f StorageClass.yaml

echo "==> Longhorn + StorageClass skonfigurowane!"


echo "=========================="
echo " WALIDACJA INSTALACJI"
echo "=========================="

echo "==> Sprawdzanie MetalLB pods:"
kubectl -n metallb-system get pods

echo "==> Sprawdzanie Envoy Gateway pods:"
kubectl -n envoy-gateway-system get pods

echo "==> Sprawdzanie cert-manager pods:"
kubectl -n cert-manager get pods

echo "==> Sprawdzanie Service Envoy Gateway:"
kubectl -n envoy-gateway-system get svc envoy-gateway

echo "==> Sprawdzanie longhorn:"
kubectl -n longhorn-system get pods

echo "=========================="
echo " INSTALACJA ZAKOŃCZONA ✔"
echo "=========================="
echo "Publiczny adres IP Envoy Gateway: $IP"