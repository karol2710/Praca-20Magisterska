#!/bin/bash
set -e

# ==========================================
# Konfiguracja
# ==========================================
MINIO_NAMESPACE="minio"
MINIO_RELEASE="minio"
MINIO_ROOT_USER="admin"
MINIO_ROOT_PASSWORD="supersecretpassword"
MINIO_BUCKET="velero"
STORAGE_CLASS="platform-storageclass"   # Twój StorageClass Longhorn
VELERO_NAMESPACE="velero"
VELERO_BUCKET="$MINIO_BUCKET"
VELERO_REGION="minio"

# ==========================================
# 1️⃣ Instalacja MinIO
# ==========================================
echo "==> Tworzenie namespace MinIO"
kubectl create ns $MINIO_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

echo "==> Instalacja MinIO przez Helm"
helm repo add minio https://charts.min.io/
helm repo update

helm upgrade --install $MINIO_RELEASE minio/minio \
  -n $MINIO_NAMESPACE \
  --set rootUser=$MINIO_ROOT_USER \
  --set rootPassword=$MINIO_ROOT_PASSWORD \
  --set persistence.size=200Gi \
  --set persistence.storageClass=$STORAGE_CLASS

# Poczekaj aż MinIO pod będzie Running
echo "==> Czekanie na MinIO pod..."
kubectl wait --for=condition=ready pod -l app=minio -n $MINIO_NAMESPACE --timeout=300s

# ==========================================
# 2️⃣ Tworzenie bucketu
# ==========================================
echo "==> Tworzenie bucketu $MINIO_BUCKET w MinIO"
kubectl -n $MINIO_NAMESPACE exec svc/minio -- mc alias set local http://127.0.0.1:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
kubectl -n $MINIO_NAMESPACE exec svc/minio -- mc mb local/$MINIO_BUCKET || echo "Bucket już istnieje"

# ==========================================
# 3️⃣ Tworzenie secretu Velero
# ==========================================
echo "==> Tworzenie secretu z poświadczeniami Velero"
cat <<EOF > velero-credentials.txt
[default]
aws_access_key_id=$MINIO_ROOT_USER
aws_secret_access_key=$MINIO_ROOT_PASSWORD
EOF

kubectl create ns $VELERO_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic cloud-credentials \
  --namespace $VELERO_NAMESPACE \
  --from-file=credentials=velero-credentials.txt \
  --dry-run=client -o yaml | kubectl apply -f -

# ==========================================
# 4️⃣ Instalacja Velero
# ==========================================
echo "==> Instalacja Velero z pluginem CSI"
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.6.0,velero/velero-plugin-for-csi:v0.6.0 \
  --bucket $VELERO_BUCKET \
  --secret-file ./velero-credentials.txt \
  --backup-location-config region=$VELERO_REGION,s3ForcePathStyle=true,s3Url=http://minio.$MINIO_NAMESPACE.svc.cluster.local:9000 \
  --snapshot-location-config region=$VELERO_REGION \
  --use-volume-snapshots=true \
  --namespace $VELERO_NAMESPACE

# ==========================================
# 5️⃣ Check instalacji
# ==========================================
echo "==> Sprawdzanie stanu instalacji..."

# MinIO pod
kubectl get pods -n $MINIO_NAMESPACE -l app=minio

# Sprawdzenie bucketu w MinIO
kubectl -n $MINIO_NAMESPACE exec svc/minio -- mc ls local/$MINIO_BUCKET || echo "UWAGA: Bucket nie istnieje"

# Velero pod
kubectl get pods -n $VELERO_NAMESPACE -l component=velero

# Secret Velero
kubectl get secret cloud-credentials -n $VELERO_NAMESPACE

echo "==> Instalacja zakończona!"
