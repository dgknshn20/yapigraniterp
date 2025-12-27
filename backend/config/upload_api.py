import os
import uuid

from django.core.files.storage import default_storage
from django.utils.text import get_valid_filename
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView


class UploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "Missing file. Use multipart field 'file'."}, status=status.HTTP_400_BAD_REQUEST)

        original_name = get_valid_filename(uploaded_file.name or "upload")
        _, ext = os.path.splitext(original_name)
        file_name = f"{uuid.uuid4().hex}{ext.lower()}"

        storage_path = default_storage.save(f"uploads/{file_name}", uploaded_file)
        relative_url = default_storage.url(storage_path)
        absolute_url = request.build_absolute_uri(relative_url)

        return Response(
            {
                "url": absolute_url,
                "path": relative_url,
                "name": original_name,
                "size": uploaded_file.size,
            },
            status=status.HTTP_201_CREATED,
        )
