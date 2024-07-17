$buildFolder = './build'
$deployFolder = './deploy'
$prodFolder = 'Z:\production\boobs'
$botProdFolder = "$($prodFolder)/bot"
$composeFile = './docker/compose.yml'
$imageFile = './docker/build-image.sh'


function Remove-If-Exists {
    $dir = $args[0]

    if (Test-Path $dir) {
        Write-Host "Deleting: $($dir)"
        Remove-Item $dir -r -Force
    } else {
        Write-Host "$($dir) doesn't exist, skipping"
    }
}

Remove-If-Exists $buildFolder
Remove-If-Exists $deployFolder

Write-Host "Compiling typescript"
tsc

Write-Host "Copying built code to deploy folder"
Copy-Item -Path $buildFolder -Destination $deployFolder -Recurse -Force

Write-Host "Downloading node_modules"
npm install

Write-Host "Copying node_modules to deploy"
Copy-Item -Path 'node_modules' -Destination $deployFolder -Force -Recurse

Write-Host "Copying reddit_reader to deploy"
Copy-Item -Path 'reddit_reader' -Destination $deployFolder -Force -Recurse

Write-Host "Deleting existing prod bot folder"
Remove-If-Exists $botProdFolder

Write-Host "Deploying bot to prod"
Copy-Item -Path $deployFolder -Destination $botProdFolder -Recurse -Force

Write-Host "Copying compose to prod"
Copy-Item -Path $composeFile -Destination $prodFolder -Force

Write-Host "Copying docker file to prod"
Copy-Item -Path './docker/Dockerfile' -Destination $prodFolder -Force

Write-Host "Writing image build script to prod"
Copy-Item -Path $imageFile -Destination $prodFolder

Write-Host "Copying package.json to prod"
Copy-Item -Path 'package.json' -Destination $prodFolder -Force

Write-Host "Copying data to prod"
Copy-Item -Path 'data' -Destination $prodFolder -Force -Recurse

Write-Host "Deploy complete!"