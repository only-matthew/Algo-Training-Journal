#include <bits/stdc++.h>
using namespace std;
double eps=0.0001;
int main() {
    int n;
    cin>>n;
    vector<int> a(n);
    for(int i=0;i<n;i++)
    cin>>a[i];
    vector<int> add(n);
    add[0]=a[0];
    for(int i=1;i<n;i++)
    add[i]=add[i-1]+a[i];
    int e=add[n-1]/n;
    int ans=0;
    for(int i=0;i<n;i++)
    {
        if((add[i])!=e*(i+1))
        ans++;
    }
    cout<<ans;
}