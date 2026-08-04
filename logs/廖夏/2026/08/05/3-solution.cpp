#include<iostream>
#include<algorithm>
using namespace std;

int n;

long long cal(string& a, string& b, int init){
    int i = init, j = init;
    long long res = 0;
    while(true){
        while(i < n && a[i] == '0')i+=2;
        while(j < n && b[j] == '0')j+=2;
        if(i >= n || j >= n) break;
        res += abs(j - i) / 2;
        i+=2, j+=2;
    }
    // 边界处理
    while (i<n&&a[i]=='0') i+=2;
    while (j<n&&b[j]=='0') j+=2;
    if (i < n || j < n) return -1;
    return res;
}

int main(){
    int t;
    cin >> t;
    while (t--){
        string a, b; cin >> n >> a >> b;
        // 对于奇数和偶数分别处理
        int i = 0, j = 0;
        long long a_ = cal(a,b,0);
        long long b_ = cal(a,b,1);
        if (a_ == -1 || b_ == -1) cout << -1 << endl;
        else cout << a_ + b_ << endl;
    }
}