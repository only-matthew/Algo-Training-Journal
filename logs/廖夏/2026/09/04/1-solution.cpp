#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 1e6 + 5;
int a[MAXN];
int n;

int find(int x){
    int l = 1; int r = n + 1; // 左闭右开查找
    while (l < r){
        int mid = l + (r - l) / 2;
        if (a[mid] >= x) r = mid;
        else l = mid + 1;
    }
    if (a[l] == x) return l;
    else return -1;
}

int main(){
    int m;
    cin >> n >> m;
    for (int i = 1; i <= n; i++) cin >> a[i];
    for (int i =1;i<=m;i++){
        int x;cin>>x;cout << find(x) << " ";
    }
    return 0;
}